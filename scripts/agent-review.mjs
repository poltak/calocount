// The steps of the "Agent review" workflow of CI. A model reads each pull
// request and reports text that breaks a rule that no lint rule or test can
// check. The general rules are in `.agents/review/prompt.md`, which comes from
// the template. A project adds its own rules in
// `.agents/review/project-rules.md`, which a sync never changes. The workflow
// runs one command in each job:
//
//   node scripts/agent-review.mjs plan              review, label, or skip
//   node scripts/agent-review.mjs claude            the review with Claude Code
//   node scripts/agent-review.mjs codex             the review with Codex
//   node scripts/agent-review.mjs save-codex-login  keep Codex's new login
//   node scripts/agent-review.mjs verdict           the comments and the result
//
// The models report two kinds of issue. A finding breaks a rule, and the
// comments call it a rule violation. Its ID is such as F3, and it fails the
// check while it is open. A note is about a problem that no rule covers, and
// the comments call it an other issue. Its ID is such as N2, and it does not
// fail the check. The ID of an issue does not change in later reviews.
//
// The first review posts the master comment of the pull request. It shows
// each issue as open or addressed, and it stores the issues. Each later review
// gives the open issues to the models, which say which ones the new commits
// addressed. Then it edits the master comment, and posts a summary comment, so
// that GitHub sends a notification. The summary says what changed, and links
// each issue to its entry in the master comment.
//
// A maintainer accepts one issue with its checkbox, and the next review moves
// it to the addressed issues. The `agent-review-accepted` label accepts each
// open finding of one head. A later review with open findings removes the
// label, so it is for the findings that the maintainer saw. A draft gets its
// review when it is ready, and a dependency update gets none.
//
// The master comment also stores the newest commit that each model read. When
// the pull request only added commits after it, the next review looks for new
// problems only in those commits, so a small push costs a small review.
//
// Each new issue on lines that the pull request adds also gets a comment on
// those lines, in a review. When a later review finds that it is addressed, it
// checks the box of the line comment.
//
// Each command reads the event from GITHUB_EVENT_PATH, and writes its outputs
// to GITHUB_OUTPUT. The maintainers are in TEMPLATE_MAINTAINERS, with commas or
// spaces between them. `gh` reads its token from GH_TOKEN.
import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { VERSION_FILE } from "./template-files.mjs";

const LABEL = "agent-review-accepted";
// A marker must not start with another one, because the script finds a
// comment by the start of its text.
const MASTER_MARKER = "<!-- agent-review-master ";
const SUMMARY_MARKER = "<!-- agent-review-summary ";
// Before the master comment, each review posted one comment with this marker.
const OLD_MARKER = "<!-- agent-review head=";
// `reviewed` is the newest commit that each model read, and `base` is the
// merge base of that review. A comment from before they were stored has
// neither.
const MARKER_FIELDS =
  /^<!-- agent-review(?:-master)? head=(\w+) blockers=(\d+)(?: reviewed=(\w+) base=(\w+))? -->/;
const STATE_PATTERN = /^<!-- agent-review-state (\S+) -->$/m;
const OLD_FINDINGS_PATTERN = /^<!-- agent-review-findings (\S+) -->$/m;
// The models read the open issues of the earlier review from this file. The
// checkout does not track it, so it is not a part of the pull request.
const EARLIER_FILE = ".agent-review/earlier-issues.md";
// The box of an issue, with its ID, in the master comment or in a line
// comment.
const BOX = /^- \[([ x])\] (?:<a id="[\w-]+"><\/a>)?\*\*([FN]\d+) ·/gm;
const LINE_BOX = /^- \[[ x]\] (?=\*\*[FN]\d+ ·)/m;
// GraphQL and REST give the login of the token of a workflow in two forms.
const BOT_LOGINS = new Set(["github-actions", "github-actions[bot]"]);
// GitHub keeps each version of a comment, with the person who made it, so a
// review can see who checked a box. The query reads 100 conversations and 100
// versions of each comment, with no more pages. A box past that limit accepts
// nothing, so its finding stays open.
const EDITS_QUERY = `query ($comment: ID!, $owner: String!, $name: String!, $number: Int!) {
  comment: node(id: $comment) {
    ... on IssueComment {
      userContentEdits(first: 100) { nodes { editedAt editor { login } diff } }
    }
  }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          comments(first: 1) {
            nodes {
              author { login }
              body
              userContentEdits(first: 100) { nodes { editedAt editor { login } diff } }
            }
          }
        }
      }
    }
  }
}`;
const MINIMIZE_QUERY = `mutation ($id: ID!) {
  minimizeComment(input: { subjectId: $id, classifier: OUTDATED }) {
    minimizedComment { isMinimized }
  }
}`;
// Each line comment has the ID of its issue, so that a later review can find
// the line comment of an issue that it addressed.
const LINE_PATTERN = /<!-- agent-review-line ([FN]\d+) -->/;
const PROMPT_FILE = ".agents/review/prompt.md";
const PROJECT_RULES_FILE = ".agents/review/project-rules.md";
const SCHEMA_FILE = ".agents/review/findings.schema.json";
const REVIEW_DIRECTORY = ".agents/review/";
const RULE_HEADING = /^### +(.+?) *$/gm;
// A dependency update changes versions and the lockfile, and no text that the
// rules are about.
const DEPENDENCY_BOTS = new Set(["renovate[bot]", "dependabot[bot]"]);
const REVIEW_ACTIONS = new Set([
  "opened",
  "synchronize",
  "reopened",
  "ready_for_review",
]);
// The reviewer reads the repository and the Git history, and nothing else.
// Without a tool for the web or for edits, a pull request cannot make it send
// or change data.
const CLAUDE_TOOLS = [
  "Read",
  "Grep",
  "Glob",
  "Bash(git diff:*)",
  "Bash(git log:*)",
  "Bash(git show:*)",
  "Bash(git grep:*)",
];
const CLAUDE_DENIED_TOOLS = [
  "Agent",
  "Edit",
  "Write",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
];
// A model can copy a token from its environment or from a file into an
// explanation, and the comment would show it to each reader of the pull
// request.
const TOKEN_PATTERN =
  /\b(?:sk-ant-[\w-]{8,}|sk-[\w-]{20,}|github_pat_\w{20,}|gh[pousr]_\w{20,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+)/g;
// GitHub can send each comment by email, and the email stays after a person
// edits the comment. So the comment shows no quote from a file that has a
// finding of these rules.
const SENSITIVE_RULES = new Set(["secret", "private-data"]);
const SENSITIVE_TEXT =
  "The comments do not show a quote from a file that has a `secret` or `private-data` rule violation. A later commit that deletes the text does not delete it from GitHub, so revoke each secret that a pushed commit has, and make a new one. Only GitHub Support can remove the commits of a pull request.";
const COMMENT_FINDING_LIMIT = 50;
// GitHub refuses a comment longer than 65,536 characters.
const COMMENT_LENGTH_LIMIT = 65_000;
// Notes do not fail the check, so a long list of them is only noise.
const NOTE_LIMIT = 3;
const root = fileURLToPath(new URL("..", import.meta.url));

const readEvent = () =>
  JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));

function writeOutputs(outputs) {
  const lines = Object.entries(outputs).map(
    ([key, value]) => `${key}=${value}`,
  );
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  }
}

function isMaintainer(login) {
  return (process.env.TEMPLATE_MAINTAINERS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((name) => name.toLowerCase() === login?.toLowerCase());
}

const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

/** Returns the commit where the branch left its base, and the head commit. */
function rangeOf(event) {
  const head = event.pull_request.head.sha;
  return { base: git("merge-base", event.pull_request.base.sha, head), head };
}

/** Returns the project file from its first rule heading to its end. */
function projectRules() {
  const file = path.join(root, PROJECT_RULES_FILE);
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const start = text.search(/^### /m);
  return start === -1 ? "" : text.slice(start).trim();
}

function pullRequestText(pull) {
  // Without this, a description could end the tag, and the text after it
  // would look like a part of the prompt.
  const clean = (text) => (text ?? "").replaceAll("</pull_request>", "");
  return `<pull_request>\nTitle: ${clean(pull.title)}\n\n${clean(pull.body) || "(no description)"}\n</pull_request>`;
}

/**
 * Returns the range of the pull request, and `from`, the commit after which
 * the models look for new problems. `from` is the newest commit that each
 * model read in an earlier review, when the pull request only added commits
 * after it. Otherwise it is the merge base, and the models read each change.
 */
function scopeOf(event, earlier) {
  const range = rangeOf(event);
  const full = (reason) => ({ ...range, from: range.base, reason });
  const reviewed = earlier?.reviewed;
  if (!reviewed) {
    return full("no earlier review has a commit that each model read");
  }
  // A rule can ask for a reason in the description, and the earlier review
  // read the changes with the old description.
  if (event.action === "edited") {
    return full("the title or the description changed");
  }
  if (reviewed === range.head) {
    return full("the earlier review read the same head");
  }
  // After a merge of the base branch, the changes after `reviewed` include
  // changes of the base branch, which are not a part of the pull request.
  if (earlier.base !== range.base) {
    return full("the merge base changed");
  }
  const inHistory =
    spawnSync("git", ["merge-base", "--is-ancestor", reviewed, range.head], {
      cwd: root,
    }).status === 0;
  if (!inHistory) {
    return full(
      `${reviewed.slice(0, 7)} is not in the history of the head, for example after a rebase`,
    );
  }
  // The earlier review read the earlier changes with the old rules.
  const rulesChanged =
    spawnSync(
      "git",
      ["diff", "--quiet", reviewed, range.head, "--", REVIEW_DIRECTORY],
      { cwd: root },
    ).status !== 0;
  if (rulesChanged) {
    return full("the rules of the review changed");
  }
  return {
    ...range,
    from: reviewed,
    reason: `each model read each change up to ${reviewed.slice(0, 7)}`,
  };
}

const PARTIAL_SCOPE = `Each model of an earlier review read each change from {{BASE}} to
{{FROM}}, so this review looks for new problems only after {{FROM}}. A new
change can break a rule together with text that an earlier commit of the pull
request added, for example when it makes a document wrong. When a rule needs
that text, read the other files, or \`git diff {{BASE}} {{HEAD}}\`. Do not
report a problem in text that the changes from {{FROM}} to {{HEAD}} do not
add, change, or make wrong.`;

function promptFor(event, earlier) {
  const { base, from, head, reason } = scopeOf(event, earlier);
  console.log(
    `The models look for new problems in ${from === base ? "each change" : `the changes after ${from}`}, because ${reason}.`,
  );
  return readFileSync(path.join(root, PROMPT_FILE), "utf8")
    .replace("{{PROJECT_RULES}}", () => projectRules())
    .replace("{{EARLIER_REVIEW}}", () => writeEarlierIssues(earlier))
    .replace(/\{\{SCOPE\}\}\n\n/, () =>
      from === base ? "" : `${PARTIAL_SCOPE}\n\n`,
    )
    .replaceAll("{{BASE}}", base)
    .replaceAll("{{FROM}}", from)
    .replaceAll("{{HEAD}}", head)
    .replace("{{PULL_REQUEST}}", () => pullRequestText(event.pull_request));
}

function writeEarlierIssues(earlier) {
  // An issue that a maintainer accepted, or that a review addressed, needs no
  // status from the models.
  const open = (earlier?.issues ?? []).filter(
    (issue) => issue.status === "open",
  );
  if (open.length === 0) {
    return "No earlier review of this pull request has an open finding or note. Return an empty list for `earlier`.";
  }
  const lines = [
    `# Open findings and notes after the review of ${earlier.head}`,
    "",
  ];
  for (const issue of open) {
    lines.push(
      `## ${issue.id}: ${issue.rule ?? "note"} in ${issue.file}${issue.line ? `:${issue.line}` : ""}`,
      "",
      issue.quote
        ? quoteBlock(issue.quote)
        : "The comment shows no quote for this issue. Find the text from the explanation.",
      "",
      issue.explanation,
      "",
    );
  }
  mkdirSync(path.dirname(path.join(root, EARLIER_FILE)), { recursive: true });
  writeFileSync(path.join(root, EARLIER_FILE), lines.join("\n"));
  const findings = open.filter((issue) => kindOf(issue) === "F").length;
  return `After the review of commit ${earlier.head}, ${count(findings, "finding")} and ${count(open.length - findings, "note")} are open. \`${EARLIER_FILE}\` has each one, with its ID.`;
}

/** Returns the name of each rule, which is the text of its heading. */
function ruleNames() {
  const text = `${readFileSync(path.join(root, PROMPT_FILE), "utf8")}\n${projectRules()}`;
  return new Set([
    ...[...text.matchAll(RULE_HEADING)].map(([, name]) => name),
    "new-document",
  ]);
}

function readPages(route) {
  return JSON.parse(
    execFileSync("gh", ["api", "--paginate", "--slurp", route], {
      encoding: "utf8",
    }),
  );
}

function callApi({ method, route, body }) {
  const output = execFileSync(
    "gh",
    ["api", "--method", method, route, "--input", "-"],
    { encoding: "utf8", input: JSON.stringify(body ?? {}) },
  );
  return output.trim() ? JSON.parse(output) : undefined;
}

const encode = (findings) =>
  Buffer.from(JSON.stringify(findings)).toString("base64");
const flatten = (text) => text.replace(/\s+/g, " ").trim();
const count = (number, word) => `${number} ${word}${number === 1 ? "" : "s"}`;
const decode = (text) =>
  text ? JSON.parse(Buffer.from(text, "base64").toString("utf8")) : [];
// The master comment stores the issues, and gzip keeps them inside its limit.
const pack = (value) => gzipSync(JSON.stringify(value)).toString("base64");
const unpack = (text) =>
  text
    ? JSON.parse(gunzipSync(Buffer.from(text, "base64")).toString("utf8"))
    : undefined;
const stateOf = (body) => unpack(body.match(STATE_PATTERN)?.[1]);
// "F" for a finding, and "N" for a note.
const kindOf = (issue) => issue.id[0];
// Markdown shows a code span as it is, so an escape in it would show as text.
const escapeOutsideCode = (text) =>
  text
    .split(/(`[^`]*`)/)
    .map((part, index) => (index % 2 === 1 ? part : escapeHtml(part)))
    .join("");
const escapeHtml = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function plan() {
  const event = readEvent();
  const pull = event.pull_request;
  let mode = "skip";
  if (pull.draft) {
    console.log("The pull request is a draft.");
  } else if (DEPENDENCY_BOTS.has(pull.user.login)) {
    console.log(`${pull.user.login} opened the pull request.`);
  } else if (
    REVIEW_ACTIONS.has(event.action) ||
    // A rule can ask for a reason in the description, so a new title or
    // description needs a new review.
    (event.action === "edited" && (event.changes?.title || event.changes?.body))
  ) {
    mode = "review";
  } else if (event.label?.name === LABEL) {
    mode = "label";
  } else {
    console.log(`A "${event.action}" event changes nothing for the review.`);
  }
  console.log(`Mode: ${mode}`);
  writeOutputs({
    mode,
    earlier: mode === "review" ? earlierReview(event) : "",
  });
}

function earlierReview(event) {
  const comment = reviewComment({
    repository: event.repository.full_name,
    number: event.pull_request.number,
  });
  const [, head, , reviewed, base] = comment?.body.match(MARKER_FIELDS) ?? [];
  if (!head) return "";
  const master = comment.body.startsWith(MASTER_MARKER);
  const issues = master
    ? (stateOf(comment.body)?.issues ?? [])
    : oldIssues({ body: comment.body, head });
  const open = issues.filter((issue) => issue.status === "open").length;
  console.log(
    `${master ? "The master comment" : `The comment of the review of ${head}`} has ${count(open, "open issue")}.`,
  );
  return pack({ head, comment: comment.id, master, issues, reviewed, base });
}

/**
 * Before the master comment, each review posted a comment that stored its
 * open findings. The next review gives them IDs, and posts the master
 * comment. A box that a maintainer checked after that comment does not count.
 */
function oldIssues({ body, head }) {
  return (unpack(body.match(OLD_FINDINGS_PATTERN)?.[1]) ?? []).map(
    ({ number, accepted, ...finding }) => ({
      ...finding,
      id: `F${number}`,
      found: 1,
      head,
      ...(accepted
        ? { status: "accepted", acceptedBy: accepted, acceptedIn: 1 }
        : { status: "open" }),
    }),
  );
}

function claude() {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    console.log("The CLAUDE_CODE_OAUTH_TOKEN secret is not set.");
    writeOutputs({ status: "not-configured" });
    return;
  }
  const result = spawnSync(
    "claude",
    [
      "-p",
      promptFor(readEvent(), unpack(process.env.EARLIER_REVIEW)),
      "--model",
      process.env.CLAUDE_MODEL,
      "--effort",
      process.env.CLAUDE_EFFORT,
      "--output-format",
      "json",
      "--json-schema",
      readFileSync(path.join(root, SCHEMA_FILE), "utf8"),
      // The reviewer gets the project's settings and AGENTS.md, and no MCP server.
      "--setting-sources",
      "project",
      "--strict-mcp-config",
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      ...CLAUDE_TOOLS,
      "--disallowedTools",
      ...CLAUDE_DENIED_TOOLS,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  let run;
  try {
    run = JSON.parse(result.stdout);
  } catch {
    run = undefined;
  }
  const findings = run?.structured_output?.findings;
  const notes = run?.structured_output?.notes ?? [];
  const statuses = run?.structured_output?.earlier ?? [];
  if (result.status !== 0 || run?.is_error || !Array.isArray(findings)) {
    const message = flatten(
      `${run?.result ?? run?.subtype ?? ""} ${result.stderr ?? ""}`,
    ).slice(0, 500);
    console.log(`Claude Code failed with status ${result.status}: ${message}`);
    writeOutputs({
      status: "failed",
      message: message || `exit status ${result.status}`,
    });
    return;
  }
  // `usage` counts only some calls of the run, and `modelUsage` counts each
  // call of each model, as `total_cost_usd` does.
  const calls = Object.values(run.modelUsage ?? {});
  const sum = (key) =>
    calls.length === 0
      ? undefined
      : calls.reduce((total, call) => total + (call[key] ?? 0), 0);
  const usage = `${tokenText({
    input:
      sum("inputTokens") +
      sum("cacheReadInputTokens") +
      sum("cacheCreationInputTokens"),
    cached: sum("cacheReadInputTokens"),
    output: sum("outputTokens"),
  })}, ${run.num_turns} turns, $${run.total_cost_usd?.toFixed(2)} at API prices`;
  console.log(
    `Claude Code: ${count(findings.length, "finding")}, ${count(notes.length, "note")}, ${count(statuses.length, "earlier issue")} checked, ${usage}.`,
  );
  writeOutputs({
    status: "ok",
    findings: encode(findings),
    notes: encode(notes),
    statuses: encode(statuses),
    usage,
  });
}

// The input of each model includes the tokens from its cache, so that the
// lines of the two models compare.
function tokenText({ input, cached, output }) {
  const number = (value) =>
    Number.isFinite(value) ? value.toLocaleString("en-US") : "?";
  return `${number(input)} input tokens, ${number(cached)} of them from the cache, and ${number(output)} output tokens`;
}

const codexHome = () =>
  path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), "agent-review-codex");

function codex() {
  const seed = process.env.CODEX_AUTH_JSON;
  if (!seed) {
    console.log("The CODEX_AUTH_JSON secret is not set.");
    writeOutputs({ status: "not-configured" });
    return;
  }
  const home = codexHome();
  mkdirSync(home, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(home, "auth.json"), seed, { mode: 0o600 });
  // Codex keeps the login in this file and not in a keyring, so that
  // `save-codex-login` can read the refreshed login.
  writeFileSync(
    path.join(home, "config.toml"),
    'cli_auth_credentials_store = "file"\n',
  );
  const lastMessage = path.join(home, "last-message.json");
  const environment = { ...process.env, CODEX_HOME: home };
  delete environment.CODEX_AUTH_JSON;
  const result = spawnSync(
    "codex",
    [
      "exec",
      "--model",
      process.env.CODEX_MODEL,
      "-c",
      `model_reasoning_effort=${process.env.CODEX_EFFORT}`,
      "--disable",
      "multi_agent",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "--cd",
      root,
      "--output-schema",
      path.join(root, SCHEMA_FILE),
      "--output-last-message",
      lastMessage,
      "--json",
      promptFor(readEvent(), unpack(process.env.EARLIER_REVIEW)),
    ],
    {
      encoding: "utf8",
      env: environment,
      input: "",
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  let output;
  try {
    output = JSON.parse(readFileSync(lastMessage, "utf8"));
  } catch {
    output = undefined;
  }
  const findings = output?.findings;
  const notes = output?.notes ?? [];
  const statuses = output?.earlier ?? [];
  if (result.status !== 0 || !Array.isArray(findings)) {
    const message = flatten(result.stderr ?? "").slice(-500);
    console.log(`Codex failed with status ${result.status}: ${message}`);
    writeOutputs({
      status: "failed",
      message: message || `exit status ${result.status}`,
    });
    return;
  }
  const tokens = [...(result.stdout ?? "").matchAll(/"usage":(\{[^}]*\})/g)]
    .map((match) => JSON.parse(match[1]))
    .at(-1);
  // Codex counts the tokens from the cache in `input_tokens`.
  const usage = tokenText({
    input: tokens?.input_tokens,
    cached: tokens?.cached_input_tokens,
    output: tokens?.output_tokens,
  });
  console.log(
    `Codex: ${count(findings.length, "finding")}, ${count(notes.length, "note")}, ${count(statuses.length, "earlier issue")} checked, ${usage}.`,
  );
  writeOutputs({
    status: "ok",
    findings: encode(findings),
    notes: encode(notes),
    statuses: encode(statuses),
    usage,
  });
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

/**
 * Codex refreshes its login when the login is about 8 days old, and the old
 * refresh token then stops working. The next run needs the new login, so the
 * workflow runs this step also when the review failed or was cancelled.
 */
function saveCodexLogin() {
  const seed = process.env.CODEX_AUTH_JSON;
  const file = path.join(codexHome(), "auth.json");
  if (!seed || !existsSync(file)) {
    return true;
  }
  const login = readFileSync(file, "utf8");
  const same = (text) => JSON.stringify(sortKeys(JSON.parse(text)));
  if (same(login) === same(seed)) {
    console.log("The Codex login did not change.");
    return true;
  }
  if (!process.env.GH_TOKEN) {
    console.log(
      [
        "Codex refreshed its login, and the CODEX_AUTH_WRITE_TOKEN secret is not set,",
        "so the CODEX_AUTH_JSON secret now has a login that does not work.",
        "Make a new login as docs/agents/setup.md describes.",
        "::error title=Agent review::The Codex login changed, and the workflow cannot save it.",
      ].join("\n"),
    );
    return false;
  }
  execFileSync(
    "gh",
    [
      "secret",
      "set",
      "CODEX_AUTH_JSON",
      "--repo",
      process.env.GITHUB_REPOSITORY,
    ],
    { encoding: "utf8", input: login },
  );
  console.log("Saved the refreshed Codex login in the CODEX_AUTH_JSON secret.");
  return true;
}

/** Reads the result of one model's job from `toJSON(needs.<job>)`. */
function modelResult({ name, model, job }) {
  const { result, outputs = {} } = JSON.parse(job || "{}");
  const empty = { findings: [], notes: [], statuses: [] };
  if (outputs.status === "not-configured") {
    return { name, model, state: "not-configured", ...empty };
  }
  if (result === "success" && outputs.status === "ok") {
    const withModel = (item) => ({ ...item, models: [name] });
    return {
      name,
      model,
      state: "ok",
      findings: decode(outputs.findings).map(withModel),
      notes: decode(outputs.notes).slice(0, NOTE_LIMIT).map(withModel),
      statuses: decode(outputs.statuses),
      usage: outputs.usage,
    };
  }
  return {
    name,
    model,
    state: "failed",
    message:
      outputs.message || `The job ended with "${result ?? "no result"}".`,
    ...empty,
  };
}

/** A new document needs a person's request, which no model can see. */
function newDocuments({ base, head }) {
  return git(
    "diff",
    "--name-only",
    "--diff-filter=A",
    base,
    head,
    "--",
    "docs/agents/",
  )
    .split("\n")
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({
      rule: "new-document",
      file,
      line: 1,
      quote:
        readFileSync(path.join(root, file), "utf8")
          .split("\n")
          .find((line) => line.trim()) ?? "",
      explanation:
        "The pull request adds a document in docs/agents/. docs/agents/README.md permits a new document only when a person asks for one, so a maintainer confirms that a person asked for it.",
      models: ["script"],
    }));
}

const quoteIsInFile = ({ file, quote }) => {
  const filePath = path.resolve(root, file);
  return (
    filePath.startsWith(root) &&
    existsSync(filePath) &&
    flatten(quote).length > 0 &&
    flatten(readFileSync(filePath, "utf8")).includes(flatten(quote))
  );
};

/**
 * Returns the oldest commit of the pull request that adds a line with the
 * quote to the file, or undefined. A value that one commit adds stays on
 * GitHub when a later commit deletes it, so the head is not enough. The quote
 * is only the text before the value, so a later commit that empties the value
 * can add the quote again. When the full file is the problem, the quote is
 * its path, and the result is the oldest commit that has the file.
 */
function commitWithQuote({ file, quote }, { base, head }) {
  const text = flatten(quote);
  // The path comes from the model, so Git must not read it as a pattern, and
  // a path outside the repository must not stop the verdict.
  const log = spawnSync(
    "git",
    [
      "--literal-pathspecs",
      "log",
      "--reverse",
      "--format=%H",
      `${base}..${head}`,
      "--",
      file,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (!text || log.status !== 0) return undefined;
  return log.stdout
    .split("\n")
    .filter(Boolean)
    .find((commit) => {
      if (text === file) {
        return (
          spawnSync("git", ["cat-file", "-e", `${commit}:${file}`], {
            cwd: root,
          }).status === 0
        );
      }
      const shown = spawnSync(
        "git",
        [
          "--literal-pathspecs",
          "show",
          "--format=",
          "--no-color",
          "--no-ext-diff",
          "-U0",
          commit,
          "--",
          file,
        ],
        { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
      );
      // The lines before the first hunk are the header, such as `+++ b/name`.
      let inHunk = false;
      const added = [];
      for (const line of shown.stdout.split("\n")) {
        if (line.startsWith("@@")) inHunk = true;
        else if (inHunk && line.startsWith("+")) added.push(line.slice(1));
      }
      return shown.status === 0 && flatten(added.join("\n")).includes(text);
    });
}

/**
 * Merges the findings that quote the same text, and keeps each model. The
 * comment shows no quote of a sensitive rule, and two models quote different
 * lines of one file, so it merges those findings by file.
 */
function mergeFindings(findings) {
  const merged = [];
  for (const finding of findings) {
    const quote = flatten(finding.quote);
    const same = merged.find(
      (other) =>
        other.file === finding.file &&
        (SENSITIVE_RULES.has(finding.rule) || SENSITIVE_RULES.has(other.rule)
          ? other.rule === finding.rule
          : flatten(other.quote).includes(quote) ||
            quote.includes(flatten(other.quote))),
    );
    if (same) {
      same.models = [...new Set([...same.models, ...finding.models])];
    } else {
      merged.push({
        ...finding,
        explanation: finding.explanation.replace(TOKEN_PATTERN, "[removed]"),
      });
    }
  }
  return merged;
}

function sameFinding(one, other) {
  if (one.file !== other.file) return false;
  const first = flatten(one.quote ?? "");
  const second = flatten(other.quote ?? "");
  // The comment stores no quote of a sensitive rule, or from its file.
  if (!first || !second || SENSITIVE_RULES.has(one.rule)) {
    return one.rule === other.rule;
  }
  return first.includes(second) || second.includes(first);
}

function linesOfQuote({ file, quote, line }) {
  const quoted = (quote ?? "")
    .trim()
    .split("\n")
    .map((text) => text.trim());
  if (!quoted[0]) return { start: line, end: line };
  const lines = readFileSync(path.resolve(root, file), "utf8").split("\n");
  // A short quote can be on more lines than one, so the line that the model
  // gave goes first.
  const index = lines[line - 1]?.includes(quoted[0])
    ? line - 1
    : lines.findIndex((text) => text.includes(quoted[0]));
  return index === -1
    ? { start: line, end: line }
    : { start: index + 1, end: index + quoted.length };
}

/**
 * Returns the lines that the pull request adds to the file. GitHub refuses a
 * review with a comment on a line that is not in the diff.
 */
function addedLines(file, { base, head }) {
  const diff = spawnSync(
    "git",
    [
      "--literal-pathspecs",
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--unified=0",
      base,
      head,
      "--",
      file,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  const hunks = (diff.stdout ?? "").matchAll(
    /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm,
  );
  return new Set(
    [...hunks].flatMap(([, start, length = "1"]) =>
      Array.from(
        { length: Number(length) },
        (_, offset) => Number(start) + offset,
      ),
    ),
  );
}

// GitHub gives the ID of an anchor in a comment the prefix `user-content-`.
const anchorOf = (id) => `agent-review-${id.toLowerCase()}`;
const isOpen = (issue) => issue.status === "open";
const isOpenFinding = (issue) => isOpen(issue) && kindOf(issue) === "F";
const firstSentence = (text) =>
  flatten(text)
    .split(/(?<=[.!?])\s/)[0]
    .slice(0, 300);

/**
 * Returns a line comment for each new issue on lines that the pull request
 * adds. The other issues are only in the master comment. GitHub sends the
 * lines around a line comment by email, so an issue in a file with a secret
 * or private data gets none.
 */
function lineComments({ added, range, view }) {
  return added
    .slice(0, COMMENT_FINDING_LIMIT)
    .filter((issue) => !view.sensitiveFiles.has(issue.file))
    .flatMap((issue) => {
      const { start, end } = linesOfQuote(issue);
      const diffLines = addedLines(issue.file, range);
      const inDiff = Array.from(
        { length: end - start + 1 },
        (_, offset) => start + offset,
      ).filter((line) => diffLines.has(line));
      if (inDiff.length === 0) return [];
      const each = end > start && inDiff.length === end - start + 1;
      return [
        {
          path: issue.file,
          side: "RIGHT",
          line: each ? end : inDiff[0],
          ...(each && { start_line: start, start_side: "RIGHT" }),
          body: [
            `<!-- agent-review-line ${issue.id} -->`,
            `- [ ] **${view.title(issue)}** (${issue.models.join(", ")})`,
            "",
            escapeOutsideCode(flatten(issue.explanation).slice(0, 1000)),
            "",
            `${view.issueLink(issue)} in the master comment of the agent review. A maintainer accepts the issue as it is with its box, and the next review moves it to the addressed issues.`,
          ].join("\n"),
        },
      ];
    });
}

/**
 * Checks the box of the line comment of each addressed or accepted issue, and
 * says why. Returns the address of the line comment of each issue. A person
 * resolves the conversation, because GitHub can refuse `resolveReviewThread`
 * to the token of a workflow, also with `pull-requests: write`.
 */
function markLines({ repository, number, fixed, accepted, link }) {
  const marks = new Map([
    ...fixed.map((issue) => [
      issue.id,
      outcomeLines({ text: `Addressed in ${link}`, item: issue }),
    ]),
    ...accepted.map((issue) => [
      issue.id,
      [`${issue.acceptedBy} accepted this issue. See ${link}.`],
    ]),
  ]);
  const addresses = new Map();
  const comments = readPages(
    `repos/${repository}/pulls/${number}/comments?per_page=100`,
  ).flat();
  for (const comment of comments) {
    const id = comment.body?.match(LINE_PATTERN)?.[1];
    if (!id || comment.user?.login !== "github-actions[bot]") continue;
    if (!addresses.has(id)) addresses.set(id, comment.html_url);
    const lines = marks.get(id);
    if (!lines || /^- \[x\] \*\*[FN]\d+ ·/m.test(comment.body)) continue;
    callApi({
      method: "PATCH",
      route: `repos/${repository}/pulls/comments/${comment.id}`,
      body: {
        body: [comment.body.replace(LINE_BOX, "- [x] "), "", ...lines].join(
          "\n",
        ),
      },
    });
  }
  return addresses;
}

// The fields of an issue that stay the same while its status changes.
const factsOf = ({
  id,
  rule,
  file,
  line,
  quote,
  explanation,
  models,
  commit,
  found,
  reopened,
  lineComment,
  head,
}) => ({
  id,
  rule,
  file,
  line,
  quote,
  explanation,
  models,
  commit,
  found,
  reopened,
  lineComment,
  head,
});

/**
 * Returns each issue after this review, and the changes since the earlier
 * review. An issue keeps the status that each model gave it, with the reason,
 * so that the comments can show where the models disagree.
 *
 * An open issue is addressed when its quote is not in its file now, or when
 * each model that gave it a status says it is addressed. A finding of the
 * script is addressed when the script does not report it again. Otherwise an
 * issue that a maintainer accepted is accepted. An addressed issue that a
 * model reports again is open again. A finding or a note that no issue covers
 * gets the next ID of its kind. `head` is the newest commit at which the
 * issue was open, for the link of an addressed issue.
 */
function followUp({ issues, findings, notes, models, accepted, review, head }) {
  const answered = models.filter((model) => model.state === "ok");
  // The models that report each issue again, by its ID.
  const reported = new Map();
  const unmatched = [];
  for (const [kind, items] of [
    ["F", findings],
    ["N", notes],
  ]) {
    for (const item of items) {
      const match = issues.find(
        (issue) => kindOf(issue) === kind && sameFinding(issue, item),
      );
      if (match) {
        reported.set(match.id, [
          ...(reported.get(match.id) ?? []),
          ...item.models,
        ]);
      } else {
        unmatched.push({ ...item, kind });
      }
    }
  }
  const changes = {
    fixed: [],
    accepted: [],
    added: [],
    reopened: [],
    disagree: [],
  };
  const next = issues.map((issue) => {
    const again = reported.has(issue.id);
    const checkable = issue.quote && !SENSITIVE_RULES.has(issue.rule);
    // Only after the check of the quote, because a later commit can have
    // deleted the file.
    const now = () => ({
      ...factsOf(issue),
      models: [
        ...new Set([...issue.models, ...(reported.get(issue.id) ?? [])]),
      ],
      head,
      line: checkable ? linesOfQuote(issue).start : issue.line,
    });
    if (issue.status === "fixed") {
      if (!again) return issue;
      const reopened = {
        ...now(),
        status: "open",
        reopened: review,
        reason: "A model reports it again.",
      };
      changes.reopened.push(reopened);
      return reopened;
    }
    const votes = answered.map((model) => {
      const status = model.statuses.find(({ id }) => id === issue.id);
      return { model: model.name, ...status };
    });
    const statuses = votes.filter((vote) => vote.status);
    const fix = (reason) => {
      const fixed = {
        ...factsOf(issue),
        status: "fixed",
        fixedIn: review,
        reason,
        votes,
      };
      changes.fixed.push(fixed);
      return fixed;
    };
    if (issue.models.includes("script") && !again) {
      return fix("The script does not report it now.");
    }
    if (checkable && !quoteIsInFile(issue)) {
      return fix("The quoted text is not in the file now.");
    }
    if (
      !again &&
      statuses.length > 0 &&
      statuses.every((status) => status.status === "addressed")
    ) {
      return fix("Each model that checked it says that it is addressed.");
    }
    if (accepted.has(issue.id)) {
      const item = {
        ...now(),
        status: "accepted",
        acceptedBy: accepted.get(issue.id),
        acceptedIn: issue.status === "accepted" ? issue.acceptedIn : review,
      };
      if (issue.status !== "accepted") changes.accepted.push(item);
      return item;
    }
    if (issue.status === "accepted") {
      const item = {
        ...now(),
        status: "open",
        reopened: review,
        reason: "A maintainer cleared its box.",
      };
      changes.reopened.push(item);
      return item;
    }
    const item = {
      ...now(),
      status: "open",
      votes,
      ...(again
        ? { reason: "A model reported it again." }
        : statuses.length === 0 && {
            reason: "No model gave a status for it.",
          }),
    };
    if (new Set(statuses.map((status) => status.status)).size > 1) {
      changes.disagree.push(item);
    }
    return item;
  });
  const numbers = Object.fromEntries(
    ["F", "N"].map((kind) => [
      kind,
      Math.max(
        0,
        ...issues
          .filter((issue) => kindOf(issue) === kind)
          .map((issue) => Number(issue.id.slice(1))),
      ),
    ]),
  );
  for (const { kind, ...item } of unmatched) {
    numbers[kind] += 1;
    changes.added.push({
      ...item,
      id: `${kind}${numbers[kind]}`,
      status: "open",
      found: review,
      head,
    });
  }
  return { issues: [...next, ...changes.added], changes };
}

/**
 * Returns each check or clear of a box that a maintainer made, from the
 * versions of a comment, oldest first. The key of a box is the ID of its
 * issue.
 */
function boxChanges(versions) {
  const boxesOf = (body) =>
    new Map([...body.matchAll(BOX)].map(([, mark, id]) => [id, mark === "x"]));
  return versions.flatMap(({ editor, at, body }, index) => {
    if (index === 0 || !isMaintainer(editor)) return [];
    const before = boxesOf(versions[index - 1].body);
    return [...boxesOf(body)]
      .filter(
        ([key, checked]) => before.has(key) && before.get(key) !== checked,
      )
      .map(([key, checked]) => ({ key, checked, login: editor, at }));
  });
}

/**
 * Returns the maintainer who accepted each issue, by its ID. A maintainer
 * accepts an issue with its box in the master comment or in its line
 * comment, and clears the box to take the acceptance back. Each review edits
 * the master comment, and stores each acceptance from before its edit, so
 * only the changes after the newest edit of the bot count, and the newest
 * change wins. A box that another person checks accepts nothing.
 */
function acceptances({ repository, number, issues, master }) {
  const accepted = new Map(
    issues
      .filter((issue) => issue.status === "accepted")
      .map((issue) => [issue.id, issue.acceptedBy]),
  );
  if (!master) return accepted;
  const [owner, name] = repository.split("/");
  let data;
  try {
    data = callApi({
      method: "POST",
      route: "graphql",
      body: {
        query: EDITS_QUERY,
        variables: { comment: master.node_id, owner, name, number },
      },
    })?.data;
  } catch (error) {
    console.log(
      `::warning title=Agent review::GitHub did not give the versions of the comments, so the review sees no new acceptance: ${flatten(String(error.stderr || error.message)).slice(0, 300)}`,
    );
    return accepted;
  }
  // GitHub gives the newest version first, and the oldest is the comment as
  // it was posted.
  const versionsOf = (node) =>
    (node?.userContentEdits?.nodes ?? [])
      .map(({ editedAt, editor, diff }) => ({
        at: editedAt,
        editor: editor?.login,
        body: diff ?? "",
      }))
      .reverse();
  const masterVersions = versionsOf(data?.comment);
  const since =
    masterVersions.filter(({ editor }) => BOT_LOGINS.has(editor)).at(-1)?.at ??
    master.created_at;
  const lineChanges = (
    data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
  ).flatMap((thread) => {
    const line = thread.comments.nodes[0];
    const id = line?.body.match(LINE_PATTERN)?.[1];
    if (!id || !BOT_LOGINS.has(line.author?.login)) return [];
    return boxChanges(versionsOf(line)).filter(({ key }) => key === id);
  });
  const ids = new Set(
    issues.filter((issue) => issue.status !== "fixed").map(({ id }) => id),
  );
  const changes = [...boxChanges(masterVersions), ...lineChanges]
    .filter(({ key, at }) => ids.has(key) && at > since)
    .sort((one, other) => one.at.localeCompare(other.at));
  for (const { key, checked, login, at } of changes) {
    console.log(
      `${login} ${checked ? "checked" : "cleared"} the box of ${key} at ${at}.`,
    );
    if (checked) accepted.set(key, login);
    else accepted.delete(key);
  }
  return accepted;
}

/**
 * The status that each model gave an issue, with its reason, as the lines of
 * a Markdown list. With no status from any model, the reason of the outcome
 * says it, so the list is empty.
 */
function voteLines(votes = []) {
  if (!votes.some((vote) => vote.status)) return [];
  return votes.map(({ model, status, explanation }) =>
    status
      ? `- ${model}: ${status}. ${escapeOutsideCode(flatten(explanation ?? "").slice(0, 300))}`
      : `- ${model} gave no status.`,
  );
}

function outcomeLines({ text, item }) {
  return [
    `${text}${item.reason ? `: ${escapeOutsideCode(flatten(item.reason).slice(0, 300))}` : "."}`,
    ...(voteLines(item.votes).length > 0 ? ["", ...voteLines(item.votes)] : []),
  ];
}

/**
 * Puts the quote in a code block, so that Markdown in it, such as a heading,
 * shows as text. The fence is longer than each run of backticks in the quote.
 */
function quoteBlock(quote) {
  const longest = Math.max(
    0,
    ...(quote.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${quote.trim()}\n${fence}`;
}

/**
 * Returns where the general rules are. In a project, that is the template, at
 * the template commit that the project has, because a person changes the
 * rules there. In the template, it is the reviewed commit.
 */
function generalRules({ server, repository, head }) {
  const versionFile = path.join(root, VERSION_FILE);
  const version = existsSync(versionFile)
    ? JSON.parse(readFileSync(versionFile, "utf8"))
    : undefined;
  // `git@github.com:owner/name.git` and `https://github.com/owner/name.git`
  const template = version?.template?.match(
    /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/,
  )?.[1];
  return template
    ? {
        repository: template,
        url: `https://github.com/${template}/blob/${version.commit}/${PROMPT_FILE}`,
        fromTemplate: true,
      }
    : {
        repository,
        url: `${server}/${repository}/blob/${head}/${PROMPT_FILE}`,
        fromTemplate: false,
      };
}

// An issue of another rule, or a note, can quote the line with the secret.
const sensitiveFilesOf = (issues) =>
  new Set(
    issues
      .filter((issue) => SENSITIVE_RULES.has(issue.rule))
      .map((issue) => issue.file),
  );

/**
 * Returns a function that links the name of a rule to its text. GitHub gives
 * each heading of a Markdown file an anchor.
 */
function ruleLinkOf({ server, repository, head }) {
  const general = generalRules({ server, repository, head });
  const generalNames = new Set(
    [
      ...readFileSync(path.join(root, PROMPT_FILE), "utf8").matchAll(
        RULE_HEADING,
      ),
    ].map(([, name]) => name),
  );
  const fileUrl = (file) =>
    `${server}/${repository}/blob/${head}/${encodeURI(file)}`;
  return (rule) => {
    if (generalNames.has(rule)) return `[${rule}](${general.url}#${rule})`;
    if (rule === "new-document") {
      return `[${rule}](${fileUrl("docs/agents/README.md")}#where-to-add-information)`;
    }
    return `[${rule}](${fileUrl(PROJECT_RULES_FILE)}#${rule})`;
  };
}

/**
 * Returns the functions that write the links and the titles of the issues in
 * a comment about the reviewed head. `reviews` gets the address of the
 * comment of each review after the comment is posted.
 */
function viewOf({ repository, number, head, issues, reviews }) {
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const repositoryUrl = `${server}/${repository}`;
  const pullUrl = `${repositoryUrl}/pull/${number}`;
  const ruleLink = ruleLinkOf({ server, repository, head });
  const sensitiveFiles = sensitiveFilesOf(issues);
  return {
    server,
    repositoryUrl,
    pullUrl,
    ruleLink,
    sensitiveFiles,
    link: ({ file, line, commit }) =>
      `[\`${file}${line ? `:${line}` : ""}\`](${repositoryUrl}/blob/${commit ?? head}/${encodeURI(file)}${line ? `#L${line}` : ""})${commit && commit !== head ? ` at commit ${commit.slice(0, 7)}` : ""}`,
    title: (issue) =>
      issue.rule
        ? `${issue.id} · ${ruleLink(issue.rule)}`
        : `${issue.id} · other issue`,
    issueLink: (issue) =>
      `[${issue.id}](${pullUrl}#user-content-${anchorOf(issue.id)})`,
    reviewLink: (review) => {
      const url = reviews[review - 1]?.url;
      return url ? `[review ${review}](${url})` : `review ${review}`;
    },
    // A pull request can be public, so the master comment stores no quote
    // that it does not show.
    showsQuote: (issue) =>
      !SENSITIVE_RULES.has(issue.rule) && !sensitiveFiles.has(issue.file),
  };
}

const are = (number) => (number === 1 ? "is" : "are");

// A paragraph comes first, because Markdown joins two lists with only an
// empty line between them into one list.
function modelLines({ models, deleted, title }) {
  const states = (model) =>
    ({
      ok: `${count(model.findings.length, "rule violation")}, ${count(model.notes.length, "other issue")}`,
      "not-configured": "not set up",
      failed: `failed. ${escapeHtml(model.message ?? "")}`,
    })[model.state];
  return [
    `**${title}**`,
    "",
    ...models.map(
      (model) => `- ${model.name} (${model.model}): ${states(model)}`,
    ),
    ...(deleted.quote > 0
      ? [
          `- Deleted: ${count(deleted.quote, "issue")} whose ${deleted.quote === 1 ? "quote" : "quotes"} ${are(deleted.quote)} not in the named file.`,
        ]
      : []),
    ...(deleted.rule > 0
      ? [
          `- Deleted: ${count(deleted.rule, "rule violation")} whose ${deleted.rule === 1 ? "rule" : "rules"} ${are(deleted.rule)} not a rule of the review.`,
        ]
      : []),
  ];
}

function usageLines({ models, title }) {
  const used = models.filter((model) => model.usage);
  if (used.length === 0) return [];
  return [
    "",
    "<details>",
    `<summary>${title}</summary>`,
    "",
    ...used.map((model) => `- ${model.name}: ${model.usage}`),
    "",
    "</details>",
  ];
}

function rulesText({ view, repository, head }) {
  const general = generalRules({ server: view.server, repository, head });
  const generalText = general.fromTemplate
    ? `The general rules are in [\`${PROMPT_FILE}\` of ${general.repository}](${general.url}), the template that this project comes from.`
    : `The general rules are in [\`${PROMPT_FILE}\`](${general.url}).`;
  const projectText = existsSync(path.join(root, PROJECT_RULES_FILE))
    ? ` The rules of ${repository} only are in ${view.link({ file: PROJECT_RULES_FILE })}.`
    : "";
  return `${generalText}${projectText} To accept each open rule violation of a commit now, a maintainer adds the \`${LABEL}\` label. A later review with open rule violations removes the label.`;
}

function openEntry({ issue, view, review }) {
  const marks = [
    `found in review ${issue.found}`,
    ...(issue.reopened ? [`open again in review ${issue.reopened}`] : []),
    ...(issue.lineComment ? [`[on its line](${issue.lineComment})`] : []),
  ];
  return [
    `- [ ] <a id="${anchorOf(issue.id)}"></a>**${view.title(issue)}** in ${view.link(issue)} (${issue.models.join(", ")}) · ${marks.join(" · ")}`,
    "",
    ...(view.showsQuote(issue) ? [quoteBlock(issue.quote), ""] : []),
    escapeOutsideCode(flatten(issue.explanation).slice(0, 1000)),
    "",
    // In a quote, the list of the models does not join the list of the next
    // issue.
    ...(issue.found === review
      ? []
      : [
          ...outcomeLines({ text: "Not yet addressed", item: issue }).map(
            (line) => (line ? `> ${line}` : ">"),
          ),
          "",
        ]),
  ];
}

function addressedEntry({ issue, view }) {
  const where = `<a id="${anchorOf(issue.id)}"></a>**${issue.id} · ${issue.rule ?? "other issue"}** in ${view.link({ file: issue.file, line: issue.line, commit: issue.commit ?? issue.head })}`;
  return issue.status === "accepted"
    ? [
        `- [x] ${where} · accepted by ${issue.acceptedBy} in ${view.reviewLink(issue.acceptedIn)}. To open it again, a maintainer clears its box.`,
      ]
    : [
        `- ${where} · addressed in ${view.reviewLink(issue.fixedIn)}: ${escapeOutsideCode(flatten(issue.reason ?? "").slice(0, 300))}`,
        ...voteLines(issue.votes).map((line) => `  ${line}`),
      ];
}

/**
 * Returns the master comment, which stores each issue for the next review.
 * `full` shows each issue, and `body` shows as many as fit in a comment:
 * first it leaves out the oldest addressed issues, then the last open ones.
 */
function masterBody({
  view,
  repository,
  issues,
  reviews,
  head,
  read,
  blockers,
  models,
  deleted,
}) {
  const review = reviews.at(-1);
  const open = [
    ...issues.filter((issue) => isOpenFinding(issue)),
    ...issues.filter((issue) => isOpen(issue) && kindOf(issue) === "N"),
  ];
  const addressed = issues
    .filter((issue) => !isOpen(issue))
    .sort(
      (one, other) =>
        (other.acceptedIn ?? other.fixedIn) - (one.acceptedIn ?? one.fixedIn),
    );
  const stored = issues.map((issue) => ({
    ...issue,
    quote: view.showsQuote(issue) ? issue.quote : "",
    explanation: flatten(issue.explanation).slice(
      0,
      issue.status === "fixed" ? 300 : 1000,
    ),
    votes: issue.votes?.map((vote) => ({
      ...vote,
      explanation: flatten(vote.explanation ?? "").slice(0, 300),
    })),
  }));
  const openFindings = open.filter((issue) => kindOf(issue) === "F").length;
  const render = (limits) => {
    const lines = [
      `${MASTER_MARKER}head=${head} blockers=${blockers}${read.reviewed ? ` reviewed=${read.reviewed} base=${read.base}` : ""} -->`,
      `<!-- agent-review-state ${pack({ issues: stored, reviews })} -->`,
      "### Agent review",
      "",
      `After review ${review.number}, of [${head.slice(0, 7)}](${view.repositoryUrl}/commit/${head}): ${count(openFindings, "open rule violation")}, ${count(open.length - openFindings, "open other issue")}, and ${count(addressed.length, "addressed issue")}.${review.number > 1 && review.url ? ` The [summary of review ${review.number}](${review.url}) says what changed.` : ""}`,
      "",
      `#### Open issues: ${open.length}`,
      "",
      open.length > 0
        ? "A maintainer accepts an issue as it is with its checkbox, here or on its line, and the next review moves it to the addressed issues. An open rule violation fails the check. An other issue does not."
        : "No issue is open.",
      "",
    ];
    open.slice(0, limits.open).forEach((issue, index) => {
      if (index === 0 || kindOf(issue) !== kindOf(open[index - 1])) {
        lines.push(
          `**${kindOf(issue) === "F" ? "Rule violations" : "Other issues"}**`,
          "",
        );
      }
      lines.push(...openEntry({ issue, view, review: review.number }));
    });
    const hiddenOpen = open.length - limits.open;
    if (hiddenOpen > 0) {
      lines.push(
        `${count(hiddenOpen, "more open issue")} ${are(hiddenOpen)} in the log of the workflow.`,
        "",
      );
    }
    if (addressed.length > 0) {
      const hidden = addressed.length - limits.addressed;
      lines.push(
        "<details>",
        `<summary>Addressed issues: ${addressed.length}</summary>`,
        "",
        ...addressed
          .slice(0, limits.addressed)
          .flatMap((issue) => addressedEntry({ issue, view })),
        ...(hidden > 0
          ? [
              "",
              `${count(hidden, "older addressed issue")} ${are(hidden)} only in the summaries of their reviews.`,
            ]
          : []),
        "",
        "</details>",
        "",
      );
    }
    if (reviews.length > 1) {
      lines.push(
        "<details>",
        `<summary>Reviews: ${reviews.length}</summary>`,
        "",
        "| Review | Commit | The models read | New | Addressed | Open after |",
        "| --- | --- | --- | --- | --- | --- |",
        ...reviews
          .slice(-30)
          .map(
            (entry) =>
              `| ${view.reviewLink(entry.number)} | ${entry.head.slice(0, 7)} | ${entry.from ? `the changes after ${entry.from.slice(0, 7)}` : "each change"} | ${entry.added} | ${entry.addressed} | ${entry.open} |`,
          ),
        "",
        "</details>",
        "",
      );
    }
    if (view.sensitiveFiles.size > 0) {
      lines.push(SENSITIVE_TEXT, "");
    }
    lines.push(
      ...modelLines({
        models,
        deleted,
        title: `The models of review ${review.number}`,
      }),
    );
    if (blockers > 0) {
      lines.push("", rulesText({ view, repository, head }));
    }
    lines.push(
      ...usageLines({
        models,
        title: `Model usage in review ${review.number}`,
      }),
    );
    return lines.join("\n").trimEnd();
  };
  let limits = { open: open.length, addressed: addressed.length };
  const full = render(limits);
  let body = full;
  while (
    body.length > COMMENT_LENGTH_LIMIT &&
    (limits.open > 0 || limits.addressed > 0)
  ) {
    limits =
      limits.addressed > 0
        ? { ...limits, addressed: Math.max(0, limits.addressed - 10) }
        : { ...limits, open: Math.max(0, limits.open - 5) };
    body = render(limits);
  }
  return { body, full };
}

/**
 * Returns the summary of a later review: what changed since the earlier
 * review, and the result of the check. It stays short, because the master
 * comment has the full text of each issue, and the status that each model
 * gave it.
 */
function summaryBody({
  view,
  issues,
  changes,
  review,
  head,
  scope,
  masterUrl,
  blockers,
  models,
  deleted,
}) {
  const openFindings = issues.filter(isOpenFinding).length;
  const openNotes = issues.filter(isOpen).length - openFindings;
  const where = (issue, commit = issue.commit) =>
    `${view.issueLink(issue)} ${issue.rule ?? "other issue"} in ${view.link({ file: issue.file, line: issue.line, commit })}`;
  const section = (title, items, entry) => {
    if (items.length === 0) return [];
    const hidden = items.length - COMMENT_FINDING_LIMIT;
    return [
      `**${title}: ${items.length}**`,
      "",
      ...items.slice(0, COMMENT_FINDING_LIMIT).flatMap(entry),
      ...(hidden > 0
        ? [`- ${hidden} more ${are(hidden)} in the master comment.`]
        : []),
      "",
    ];
  };
  const lines = [
    `${SUMMARY_MARKER}head=${head} review=${review} -->`,
    `### Agent review ${review}, of ${head.slice(0, 7)}: the check ${blockers === 0 ? "passes" : "fails"}`,
    "",
    `${count(openFindings, "open rule violation")} and ${count(openNotes, "open other issue")}. The [master comment](${masterUrl}) of the agent review has each issue.`,
    "",
    scope.from === scope.base
      ? `The models read each change of the pull request, because ${scope.reason}.`
      : `The models looked for new problems only in [the changes after ${scope.from.slice(0, 7)}](${view.repositoryUrl}/compare/${scope.from}...${head}). Each model read the changes before them in an earlier review.`,
    "",
    ...section("Addressed", changes.fixed, (issue) => [
      `- ${where(issue, issue.commit ?? issue.head)}: ${escapeOutsideCode(flatten(issue.reason).slice(0, 300))}`,
    ]),
    ...section("Accepted by a maintainer", changes.accepted, (issue) => [
      `- ${where(issue)}: accepted by ${issue.acceptedBy}.`,
    ]),
    ...section("New", changes.added, (issue) => [
      `- ${where(issue)}. ${escapeOutsideCode(firstSentence(issue.explanation))}`,
    ]),
    ...section("Open again", changes.reopened, (issue) => [
      `- ${where(issue)}: ${issue.reason}`,
    ]),
    ...section("The models disagree", changes.disagree, (issue) => [
      `- ${where(issue)}: ${issue.votes
        .filter((vote) => vote.status)
        .map((vote) => `${vote.model} says ${vote.status}`)
        .join(", ")}.`,
    ]),
  ];
  if (Object.values(changes).every((list) => list.length === 0)) {
    lines.push(`No issue changed since review ${review - 1}.`, "");
  }
  lines.push(...modelLines({ models, deleted, title: "The models" }));
  if (blockers > 0) {
    lines.push(
      "",
      `To pass the check, address each open rule violation. A maintainer can also accept an issue with its checkbox in the master comment, and the next review moves it to the addressed issues. To accept each open rule violation of this commit now, a maintainer adds the \`${LABEL}\` label.`,
    );
  }
  lines.push(...usageLines({ models, title: "Model usage" }));
  return lines.join("\n").trimEnd();
}

/**
 * A pull request that had its reviews before the master comment existed has
 * one comment for each review. The newest of them has the issues that the
 * next review must keep.
 */
function reviewComment({ repository, number }) {
  const comments = readPages(
    `repos/${repository}/issues/${number}/comments?per_page=100`,
  )
    .flat()
    .filter((comment) => comment.user?.login === "github-actions[bot]");
  return (
    comments.find((comment) => comment.body.startsWith(MASTER_MARKER)) ??
    comments.filter((comment) => comment.body.startsWith(OLD_MARKER)).at(-1)
  );
}

/**
 * Hides the summary of the earlier review as outdated, so that the pull
 * request shows only the newest one. The master comment links each summary.
 */
function hideSummary(node) {
  try {
    const result = callApi({
      method: "POST",
      route: "graphql",
      body: { query: MINIMIZE_QUERY, variables: { id: node } },
    });
    if (result?.errors) throw new Error(JSON.stringify(result.errors));
  } catch (error) {
    console.log(
      `::warning title=Agent review::GitHub did not hide the summary of the earlier review: ${flatten(String(error.stderr || error.message)).slice(0, 300)}`,
    );
  }
}

function reviewVerdict(event) {
  const repository = event.repository.full_name;
  const pull = event.pull_request;
  const head = pull.head.sha;
  const current = readPages(`repos/${repository}/pulls/${pull.number}`)[0].head
    .sha;
  if (current !== head) {
    console.log(`A newer push (${current}) replaced the review of ${head}.`);
    return true;
  }
  // The Claude job stops when a newer review of the pull request starts, such
  // as after an edit of the description. That review posts the result, and a
  // second result for the head would count each change two times.
  if (JSON.parse(process.env.CLAUDE_JOB || "{}").result === "cancelled") {
    console.log(
      "Something cancelled the Claude job: a newer review of this head, a person, or the time limit. So this review posts nothing. When no newer review runs, run the review again.",
    );
    return false;
  }

  const models = [
    modelResult({
      name: "Claude",
      model: `${process.env.CLAUDE_MODEL}, ${process.env.CLAUDE_EFFORT}`,
      job: process.env.CLAUDE_JOB,
    }),
    modelResult({
      name: "Codex",
      model: `${process.env.CODEX_MODEL}, ${process.env.CODEX_EFFORT}`,
      job: process.env.CODEX_JOB,
    }),
  ];
  if (models.every((model) => model.state === "not-configured")) {
    console.log(
      "No model is set up, so nothing reviewed the pull request. docs/agents/setup.md describes the secrets.",
    );
    return true;
  }

  const range = rangeOf(event);
  const found = [
    ...models.flatMap((model) => model.findings),
    ...newDocuments(range),
  ].map((finding) =>
    SENSITIVE_RULES.has(finding.rule)
      ? { ...finding, commit: commitWithQuote(finding, range) }
      : finding,
  );
  const rules = ruleNames();
  const deleted = { quote: 0, rule: 0 };
  const kept = found.filter((finding) => {
    const sensitive = SENSITIVE_RULES.has(finding.rule);
    const reason = !rules.has(finding.rule)
      ? "rule"
      : !(sensitive ? finding.commit : quoteIsInFile(finding))
        ? "quote"
        : undefined;
    if (reason) {
      deleted[reason] += 1;
      console.log(
        `Deleted a finding of ${finding.models.join(", ")}, because ${reason === "rule" ? `"${finding.rule}" is not a rule of the review` : `its quote is not in ${finding.file}`}${sensitive ? "." : `: ${flatten(finding.quote).slice(0, 200)}`}`,
      );
    }
    return !reason;
  });
  const allNotes = models.flatMap((model) => model.notes);
  const notes = allNotes.filter(quoteIsInFile);
  deleted.quote += allNotes.length - notes.length;

  const earlier = unpack(process.env.EARLIER_REVIEW);
  const scope = scopeOf(event, earlier);
  // A model that failed did not read the changes, so the next review reads
  // them again, from the commit that each model read.
  const read = models.every((model) => model.state !== "failed")
    ? { reviewed: head, base: range.base }
    : { reviewed: earlier?.reviewed, base: earlier?.base };
  // The plan job read the master comment before the models ran, and a
  // maintainer can have checked a box since then.
  const master = earlier?.master
    ? readPages(`repos/${repository}/issues/comments/${earlier.comment}`)[0]
    : undefined;
  const state = (master && stateOf(master.body)) ?? {
    issues: earlier?.issues ?? [],
    reviews: [],
  };
  const review = state.reviews.length + 1;
  const { issues, changes } = followUp({
    issues: state.issues,
    findings: mergeFindings(kept),
    notes: mergeFindings(notes),
    models,
    accepted: acceptances({
      repository,
      number: pull.number,
      issues: state.issues,
      master,
    }),
    review,
    head,
  });
  const blockers =
    issues.filter(isOpenFinding).length +
    models.filter((model) => model.state === "failed").length;
  const reviews = [
    ...state.reviews,
    {
      number: review,
      head,
      from: scope.from === scope.base ? undefined : scope.from,
      added: changes.added.length,
      addressed: changes.fixed.length + changes.accepted.length,
      open: issues.filter(isOpen).length,
    },
  ];
  const view = viewOf({
    repository,
    number: pull.number,
    head,
    issues,
    reviews,
  });
  const masterOf = (shown) =>
    masterBody({
      view,
      repository,
      issues: shown,
      reviews,
      head,
      read,
      blockers,
      models,
      deleted,
    });
  const commentsRoute = `repos/${repository}/issues/${pull.number}/comments`;

  // The first review posts the master comment. Each later review posts a
  // summary, and not only an edit, so that GitHub sends a notification.
  let posted = master;
  if (master) {
    const body = summaryBody({
      view,
      issues,
      changes,
      review,
      head,
      scope,
      masterUrl: `${view.pullUrl}#issuecomment-${master.id}`,
      blockers,
      models,
      deleted,
    });
    console.log(body);
    const summary = callApi({
      method: "POST",
      route: commentsRoute,
      body: { body },
    });
    Object.assign(reviews.at(-1), {
      url: summary?.html_url,
      node: summary?.node_id,
    });
  } else {
    const { body, full } = masterOf(issues);
    console.log(full);
    posted = callApi({ method: "POST", route: commentsRoute, body: { body } });
    reviews.at(-1).url = posted?.html_url;
  }
  const masterUrl = posted?.id
    ? `${view.pullUrl}#issuecomment-${posted.id}`
    : view.pullUrl;

  // The master comment has each issue, so a line comment that GitHub refuses
  // must not stop the verdict.
  const lineFailed = (error) =>
    console.log(
      `::warning title=Agent review::GitHub refused a line comment: ${flatten(String(error.stderr || error.message)).slice(0, 300)}`,
    );
  let comments = [];
  try {
    comments = lineComments({ added: changes.added, range, view });
    if (comments.length > 0) {
      // A review that requests changes blocks the merge until a person
      // dismisses it, also after a maintainer accepts the issues with the
      // label. The check already fails while a rule violation is open.
      callApi({
        method: "POST",
        route: `repos/${repository}/pulls/${pull.number}/reviews`,
        body: {
          commit_id: head,
          event: "COMMENT",
          body: `${count(comments.length, "new issue")} of the agent review ${are(comments.length)} on lines of this change. The [master comment](${masterUrl}) of the agent review has each issue, and the result of the check.`,
          comments,
        },
      });
    }
  } catch (error) {
    lineFailed(error);
  }
  let addresses = new Map();
  if (
    comments.length > 0 ||
    changes.fixed.length > 0 ||
    changes.accepted.length > 0
  ) {
    try {
      addresses = markLines({
        repository,
        number: pull.number,
        fixed: changes.fixed,
        accepted: changes.accepted,
        link: view.reviewLink(review),
      });
    } catch (error) {
      lineFailed(error);
    }
  }
  const linked = issues.map((issue) =>
    !issue.lineComment && addresses.has(issue.id)
      ? { ...issue, lineComment: addresses.get(issue.id) }
      : issue,
  );
  if (
    posted?.id &&
    (master || linked.some((issue, index) => issue !== issues[index]))
  ) {
    const { body, full } = masterOf(linked);
    if (master) console.log(full);
    callApi({
      method: "PATCH",
      route: `repos/${repository}/issues/comments/${posted.id}`,
      body: { body },
    });
  }
  const earlierSummary = state.reviews.at(-1)?.node;
  if (master && earlierSummary) {
    hideSummary(earlierSummary);
  }

  if (blockers === 0) {
    return true;
  }
  if (pull.labels.some((label) => label.name === LABEL)) {
    callApi({
      method: "DELETE",
      route: `repos/${repository}/issues/${pull.number}/labels/${LABEL}`,
    });
    console.log(
      `The review has open rule violations, so it removed the ${LABEL} label.`,
    );
  }
  console.log(
    `::error title=Agent review::The review has ${blockers} open ${blockers === 1 ? "item" : "items"}. A maintainer accepts them with the ${LABEL} label.`,
  );
  return false;
}

function labelVerdict(event) {
  const repository = event.repository.full_name;
  const pull = event.pull_request;
  const marker = reviewComment({ repository, number: pull.number })?.body.match(
    MARKER_FIELDS,
  );
  if (marker?.[1] !== pull.head.sha) {
    console.log(
      `::error title=Agent review::The review of ${pull.head.sha} has not finished. Its result replaces this one.`,
    );
    return false;
  }
  if (Number(marker[2]) === 0) {
    console.log("The review of the head commit has no open items.");
    return true;
  }
  if (pull.labels.some((label) => label.name === LABEL)) {
    const adder = readPages(
      `repos/${repository}/issues/${pull.number}/events?per_page=100`,
    )
      .flat()
      .filter(
        (entry) => entry.event === "labeled" && entry.label?.name === LABEL,
      )
      .at(-1)?.actor?.login;
    if (isMaintainer(adder)) {
      console.log(`${adder}, a maintainer, accepted the open items.`);
      return true;
    }
    console.log(`${adder} added the ${LABEL} label, and is not a maintainer.`);
  }
  console.log(
    `::error title=Agent review::The review has ${marker[2]} open items. A maintainer accepts them with the ${LABEL} label.`,
  );
  return false;
}

function verdict() {
  const event = readEvent();
  return process.env.MODE === "label"
    ? labelVerdict(event)
    : reviewVerdict(event);
}

const commands = {
  plan,
  claude,
  codex,
  "save-codex-login": saveCodexLogin,
  verdict,
};
const command = commands[process.argv[2]];
if (!command) {
  console.error(
    `Usage: node scripts/agent-review.mjs <${Object.keys(commands).join("|")}>`,
  );
  process.exit(2);
}
process.exitCode = command() === false ? 1 : 0;
