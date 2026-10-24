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
//   node scripts/agent-review.mjs verdict           the comment and the result
//
// The verdict fails while a finding is open. A maintainer accepts the findings
// with the `agent-review-accepted` label. A later review with findings removes
// the label, so an acceptance is for the findings that the maintainer saw. A
// draft gets its review when it is ready, and a dependency update gets none.
//
// Each review posts a new comment, which stores its open findings. The next
// review gives them to the models, which say which ones the new commits
// addressed. The new comment repeats the open ones, and the earlier comment
// gets a mark on each finding.
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
const MARKER = "<!-- agent-review";
const HEAD_PATTERN = /^<!-- agent-review head=(\w+) blockers=(\d+) -->/;
const FINDINGS_PATTERN = /^<!-- agent-review-findings (\S+) -->$/m;
// The models read the findings of the earlier review from this file. The
// checkout does not track it, so it is not a part of the pull request.
const EARLIER_FILE = ".agent-review/earlier-findings.md";
const ADDRESSED = "✅ Addressed · ";
const NOT_ADDRESSED = "⏳ Not yet addressed · ";
const PROMPT_FILE = ".agents/review/prompt.md";
const PROJECT_RULES_FILE = ".agents/review/project-rules.md";
const SCHEMA_FILE = ".agents/review/findings.schema.json";
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

function promptFor(event, earlierText) {
  const { base, head } = rangeOf(event);
  return readFileSync(path.join(root, PROMPT_FILE), "utf8")
    .replace("{{PROJECT_RULES}}", () => projectRules())
    .replace("{{EARLIER_REVIEW}}", () => earlierText)
    .replaceAll("{{BASE}}", base)
    .replaceAll("{{HEAD}}", head)
    .replace("{{PULL_REQUEST}}", () => pullRequestText(event.pull_request));
}

/**
 * Writes the findings of the earlier review to EARLIER_FILE, and returns the
 * text that tells the model about them.
 */
function writeEarlierFindings() {
  const earlier = unpack(process.env.EARLIER_REVIEW);
  if (!earlier || earlier.findings.length === 0) {
    return "No earlier review of this pull request has an open finding. Return an empty list for `earlier`.";
  }
  const lines = [`# Findings of the review of ${earlier.head}`, ""];
  for (const finding of earlier.findings) {
    lines.push(
      `## E${finding.number}: ${finding.rule} in ${finding.file}${finding.line ? `:${finding.line}` : ""}`,
      "",
      finding.quote
        ? quoteBlock(finding.quote)
        : "The comment shows no quote for this finding. Find the text from the explanation.",
      "",
      finding.explanation,
      "",
    );
  }
  mkdirSync(path.dirname(path.join(root, EARLIER_FILE)), { recursive: true });
  writeFileSync(path.join(root, EARLIER_FILE), lines.join("\n"));
  return `The review of commit ${earlier.head} has ${count(earlier.findings.length, "open finding")}. \`${EARLIER_FILE}\` has each one, with its ID.`;
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
// The comment stores the findings, and gzip keeps them inside its limit.
const pack = (value) => gzipSync(JSON.stringify(value)).toString("base64");
const unpack = (text) =>
  text
    ? JSON.parse(gunzipSync(Buffer.from(text, "base64")).toString("utf8"))
    : undefined;
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

/**
 * Returns the open findings of the newest review comment, with the head that
 * it reviewed and the ID of the comment.
 */
function earlierReview(event) {
  const comment = stickyComment({
    repository: event.repository.full_name,
    number: event.pull_request.number,
  });
  const head = comment?.body.match(HEAD_PATTERN)?.[1];
  if (!head) return "";
  const stored = comment.body.match(FINDINGS_PATTERN)?.[1];
  const findings = stored ? unpack(stored) : findingsInText(comment.body);
  console.log(
    `The review of ${head} has ${count(findings.length, "open finding")}.`,
  );
  return pack({ head, comment: comment.id, findings });
}

/**
 * A comment from before the comments stored their findings shows each
 * finding up to COMMENT_FINDING_LIMIT, so the findings come from its text.
 */
function findingsInText(body) {
  return body
    .split(/^(?=\*\*\d+\. \[)/m)
    .slice(1)
    .flatMap((entry) => {
      const match = entry.match(
        /^\*\*(\d+)\. \[([^\]]+)\][^`]*`([^`]+?)(?::(\d+))?`\]\([^)]*\)(?: at commit \w+)? \(([^)]*)\)/,
      );
      if (!match) return [];
      const [heading, number, rule, file, line, models] = match;
      const quoteMatch = entry.match(/^(`{3,})text\n([\s\S]*?)\n\1$/m);
      const rest = entry
        .slice(heading.length)
        .replace(quoteMatch?.[0] ?? "", "");
      return [
        {
          number: Number(number),
          rule,
          file,
          line: line ? Number(line) : null,
          quote: quoteMatch?.[2] ?? "",
          // The new comment escapes the explanation again.
          explanation: (rest.trim().split(/\n\s*\n/)[0] ?? "")
            .replaceAll("&lt;", "<")
            .replaceAll("&gt;", ">")
            .replaceAll("&amp;", "&"),
          models: models.split(", "),
        },
      ];
    });
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
      promptFor(readEvent(), writeEarlierFindings()),
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
  console.log(
    `Claude Code: ${count(findings.length, "finding")}, ${count(notes.length, "note")}, ${count(statuses.length, "earlier finding")} checked, ${run.num_turns} turns, $${run.total_cost_usd?.toFixed(2)} at API prices.`,
  );
  writeOutputs({
    status: "ok",
    findings: encode(findings),
    notes: encode(notes),
    statuses: encode(statuses),
  });
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
      promptFor(readEvent(), writeEarlierFindings()),
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
  const usage = [...(result.stdout ?? "").matchAll(/"usage":(\{[^}]*\})/g)]
    .map((match) => JSON.parse(match[1]))
    .at(-1);
  console.log(
    `Codex: ${count(findings.length, "finding")}, ${count(notes.length, "note")}, ${count(statuses.length, "earlier finding")} checked, ${usage?.input_tokens ?? "?"} input and ${usage?.output_tokens ?? "?"} output tokens.`,
  );
  writeOutputs({
    status: "ok",
    findings: encode(findings),
    notes: encode(notes),
    statuses: encode(statuses),
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

/** The two findings are about the same text. */
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

/** Returns the line of the head where the quote starts now. */
function lineOfQuote({ file, quote, line }) {
  const first = quote
    ?.split("\n")
    .find((text) => text.trim())
    ?.trim();
  if (!first) return line;
  const index = readFileSync(path.resolve(root, file), "utf8")
    .split("\n")
    .findIndex((text) => text.includes(first));
  return index === -1 ? line : index + 1;
}

/**
 * Sorts the findings of the earlier review into the addressed and the open
 * ones, and keeps only the new findings that no earlier finding covers.
 *
 * An earlier finding is addressed when its quote is not in its file now, or
 * when each model that answered says it is addressed. A finding that a model
 * reports again is open, whatever the statuses say. A finding of the script
 * is addressed when the script does not report it again.
 */
function followUp({ earlier, findings, models }) {
  if (!earlier) return { carried: [], addressed: [], added: findings };
  const reported = new Set();
  const added = findings.filter((finding) => {
    const match = earlier.findings.find((old) => sameFinding(old, finding));
    if (match) reported.add(match.number);
    return !match;
  });
  const answered = models.filter((model) => model.state === "ok");
  const carried = [];
  const addressed = [];
  for (const old of earlier.findings) {
    const statuses = answered.flatMap((model) =>
      model.statuses
        .filter((status) => status.id === `E${old.number}`)
        .map((status) => ({ ...status, model: model.name })),
    );
    const checkable = old.quote && !SENSITIVE_RULES.has(old.rule);
    const item = { ...old, earlierNumber: old.number };
    if (reported.has(old.number)) {
      carried.push({ ...item, reason: "A model reported it again." });
    } else if (old.models.includes("script")) {
      addressed.push({ ...item, reason: "The script does not report it now." });
    } else if (checkable && !quoteIsInFile(old)) {
      addressed.push({
        ...item,
        reason: "The quoted text is not in the file now.",
      });
    } else if (
      statuses.length > 0 &&
      statuses.every((status) => status.status === "addressed")
    ) {
      addressed.push({
        ...item,
        reason: `${statuses[0].explanation} (${statuses.map((status) => status.model).join(", ")})`,
      });
    } else {
      const open = statuses.find((status) => status.status === "open");
      carried.push({
        ...item,
        line: checkable ? lineOfQuote(old) : old.line,
        reason: open
          ? `${open.explanation} (${open.model})`
          : "No model said that it is addressed.",
      });
    }
  }
  return { carried, addressed, added };
}

/**
 * Puts a mark on each finding of the earlier comment, and a line under its
 * heading that links to the follow-up. A mark from an earlier follow-up goes
 * first.
 */
function markEarlier(body, { carried, addressed, link }) {
  const marks = new Map([
    ...addressed.map((item) => [item.earlierNumber, ADDRESSED]),
    ...carried.map((item) => [item.earlierNumber, NOT_ADDRESSED]),
  ]);
  return body
    .replace(/\n\n> Follow-up: [^\n]*/, "")
    .replaceAll(ADDRESSED, "")
    .replaceAll(NOT_ADDRESSED, "")
    .replace(
      /^### Agent review of .*$/m,
      (heading) =>
        `${heading}\n\n> Follow-up: ${link}: ${addressed.length} addressed, ${carried.length} not yet addressed.`,
    )
    .replace(
      /^\*\*(\d+)\. \[/gm,
      (start, number) => `${marks.get(Number(number)) ?? ""}${start}`,
    );
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

/**
 * `findings` are the open findings, each with its number: first the ones that
 * `carried` holds from the earlier review, then the new ones.
 */
function commentFor({
  repository,
  number,
  head,
  earlier,
  findings,
  carried,
  addressed,
  notes,
  models,
  deleted,
  limit,
}) {
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const fileUrl = (file, commit = head) =>
    `${server}/${repository}/blob/${commit}/${encodeURI(file)}`;
  const link = ({ file, line, commit }) =>
    `[\`${file}${line ? `:${line}` : ""}\`](${fileUrl(file, commit)}${line ? `#L${line}` : ""})${commit && commit !== head ? ` at commit ${commit.slice(0, 7)}` : ""}`;
  const general = generalRules({ server, repository, head });
  const generalNames = new Set(
    [
      ...readFileSync(path.join(root, PROMPT_FILE), "utf8").matchAll(
        RULE_HEADING,
      ),
    ].map(([, name]) => name),
  );
  // GitHub gives each heading of a Markdown file an anchor, so the name links
  // to the text of its rule.
  const ruleLink = (rule) => {
    if (generalNames.has(rule)) return `[${rule}](${general.url}#${rule})`;
    if (rule === "new-document") {
      return `[${rule}](${fileUrl("docs/agents/README.md")}#where-to-add-information)`;
    }
    return `[${rule}](${fileUrl(PROJECT_RULES_FILE)}#${rule})`;
  };
  const failed = models.filter((model) => model.state === "failed");
  const blockers = findings.length + failed.length;
  // A finding of another rule, or a note, can quote the line with the secret.
  const sensitiveFiles = new Set(
    [...findings, ...addressed]
      .filter((finding) => SENSITIVE_RULES.has(finding.rule))
      .map((finding) => finding.file),
  );
  const hidesQuote = (item) =>
    SENSITIVE_RULES.has(item.rule) || sensitiveFiles.has(item.file);
  // The next review reads these findings. A pull request can be public, so
  // they keep no quote that the comment does not show.
  const stored = findings.map(
    ({ number, rule, file, line, quote, explanation, models }) => ({
      number,
      rule,
      file,
      line,
      quote: hidesQuote({ rule, file }) ? "" : quote,
      explanation: flatten(explanation).slice(0, 1000),
      models,
    }),
  );
  const earlierLink = earlier
    ? `[review of ${earlier.head.slice(0, 7)}](${server}/${repository}/pull/${number}#issuecomment-${earlier.comment})`
    : "";
  const lines = [
    `${MARKER} head=${head} blockers=${blockers} -->`,
    `<!-- agent-review-findings ${pack(stored)} -->`,
    `### Agent review of ${head.slice(0, 7)}: ${findings.length === 0 ? "no findings" : count(findings.length, "finding")}`,
    "",
  ];
  if (earlier) {
    lines.push(
      `Follow-up of the ${earlierLink}: ${addressed.length} addressed, ${carried.length} not yet addressed, ${findings.length - carried.length} new.`,
      "",
    );
  }
  const entry = (item, title) => [
    `**${title}** in ${link(item)} (${item.models.join(", ")})`,
    "",
    ...(sensitiveFiles.has(item.file) ? [] : [quoteBlock(item.quote), ""]),
    escapeOutsideCode(flatten(item.explanation).slice(0, 1000)),
    "",
    ...(item.reason
      ? [
          `Not yet addressed: ${escapeOutsideCode(flatten(item.reason).slice(0, 500))}`,
          "",
        ]
      : []),
  ];
  findings.slice(0, limit).forEach((finding, index) => {
    if (earlier && index === 0 && carried.length > 0) {
      lines.push(`#### Not yet addressed from the ${earlierLink}`, "");
    }
    if (earlier && index === carried.length) {
      lines.push("#### New findings", "");
    }
    lines.push(
      ...entry(finding, `${finding.number}. ${ruleLink(finding.rule)}`),
    );
  });
  if (findings.length > limit) {
    lines.push(
      `${findings.length - limit} more findings are in the log of the workflow.`,
      "",
    );
  }
  if (addressed.length > 0) {
    lines.push(
      "<details>",
      `<summary>Addressed since the review of ${earlier.head.slice(0, 7)}: ${addressed.length}</summary>`,
      "",
      ...addressed.map(
        (item) =>
          `- ~~${item.earlierNumber}. ${item.rule}~~ in ${link({ file: item.file, line: item.line, commit: earlier.head })}: ${escapeOutsideCode(flatten(item.reason).slice(0, 300))}`,
      ),
      "",
      "</details>",
      "",
    );
  }
  if (sensitiveFiles.size > 0) {
    lines.push(
      `The comment does not show a quote from a file that has a ${[...SENSITIVE_RULES].map((rule) => `\`${rule}\``).join(" or ")} finding. A later commit that deletes the text does not delete it from GitHub, so revoke each secret that a pushed commit has, and make a new one. Only GitHub Support can remove the commits of a pull request.`,
      "",
    );
  }
  for (const model of models) {
    const state = {
      ok: `${count(model.findings.length, "finding")}, ${count(model.notes.length, "note")}`,
      "not-configured": "not set up",
      failed: `failed. ${escapeHtml(model.message ?? "")}`,
    }[model.state];
    lines.push(`- ${model.name} (${model.model}): ${state}`);
  }
  if (deleted.quote > 0) {
    lines.push(
      `- Deleted: ${deleted.quote} ${deleted.quote === 1 ? "finding or note whose quote is" : "findings or notes whose quotes are"} not in the named file.`,
    );
  }
  if (deleted.rule > 0) {
    lines.push(
      `- Deleted: ${deleted.rule} ${deleted.rule === 1 ? "finding whose rule is" : "findings whose rules are"} not a rule of the review.`,
    );
  }
  if (blockers > 0) {
    const generalText = general.fromTemplate
      ? `The general rules are in [\`${PROMPT_FILE}\` of ${general.repository}](${general.url}), the template that this project comes from.`
      : `The general rules are in [\`${PROMPT_FILE}\`](${general.url}).`;
    const projectText = existsSync(path.join(root, PROJECT_RULES_FILE))
      ? ` The rules of ${repository} only are in ${link({ file: PROJECT_RULES_FILE })}.`
      : "";
    lines.push(
      "",
      `${generalText}${projectText} When each finding is wrong or accepted, a maintainer adds the \`${LABEL}\` label. A later review with findings removes the label.`,
    );
  }
  if (notes.length > 0) {
    lines.push(
      "",
      "---",
      "",
      "#### Other notes",
      "",
      "No rule covers these notes, and they do not fail the check.",
      "",
    );
    notes.forEach((note, index) => {
      lines.push(...entry(note, `${index + 1}.`));
    });
  }
  return { body: lines.join("\n").trimEnd(), blockers };
}

function stickyComment({ repository, number }) {
  return readPages(`repos/${repository}/issues/${number}/comments?per_page=100`)
    .flat()
    .filter(
      (comment) =>
        comment.user?.login === "github-actions[bot]" &&
        comment.body.startsWith(MARKER),
    )
    .at(-1);
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
  const earlier = unpack(process.env.EARLIER_REVIEW);
  const { carried, addressed, added } = followUp({
    earlier,
    findings: mergeFindings(kept),
    models,
  });
  const findings = [...carried, ...added].map((finding, index) => ({
    ...finding,
    number: index + 1,
  }));
  const allNotes = models.flatMap((model) => model.notes);
  const notes = mergeFindings(allNotes.filter(quoteIsInFile));
  deleted.quote += allNotes.length - allNotes.filter(quoteIsInFile).length;
  const commentWith = (limit) =>
    commentFor({
      repository,
      number: pull.number,
      head,
      earlier,
      findings,
      carried,
      addressed,
      notes,
      models,
      deleted,
      limit,
    });
  console.log(commentWith(Infinity).body);
  let limit = COMMENT_FINDING_LIMIT;
  let comment = commentWith(limit);
  while (comment.body.length > COMMENT_LENGTH_LIMIT && limit > 0) {
    limit = Math.max(0, limit - 5);
    comment = commentWith(limit);
  }
  const { body, blockers } = comment;

  // A new comment, and not an edit, so that GitHub sends a notification.
  const posted = callApi({
    method: "POST",
    route: `repos/${repository}/issues/${pull.number}/comments`,
    body: { body },
  });
  const previous =
    earlier &&
    readPages(`repos/${repository}/issues/comments/${earlier.comment}`)[0];
  if (previous) {
    const link = posted?.html_url
      ? `[review of ${head.slice(0, 7)}](${posted.html_url})`
      : `review of ${head.slice(0, 7)}`;
    callApi({
      method: "PATCH",
      route: `repos/${repository}/issues/comments/${earlier.comment}`,
      body: { body: markEarlier(previous.body, { carried, addressed, link }) },
    });
  }

  if (blockers === 0) {
    return true;
  }
  if (pull.labels.some((label) => label.name === LABEL)) {
    callApi({
      method: "DELETE",
      route: `repos/${repository}/issues/${pull.number}/labels/${LABEL}`,
    });
    console.log(`The review has findings, so it removed the ${LABEL} label.`);
  }
  console.log(
    `::error title=Agent review::The review has ${blockers} open ${blockers === 1 ? "item" : "items"}. A maintainer accepts them with the ${LABEL} label.`,
  );
  return false;
}

function labelVerdict(event) {
  const repository = event.repository.full_name;
  const pull = event.pull_request;
  const marker = stickyComment({ repository, number: pull.number })?.body.match(
    HEAD_PATTERN,
  );
  if (marker?.[1] !== pull.head.sha) {
    console.log(
      `::error title=Agent review::The review of ${pull.head.sha} has not finished. Its result replaces this one.`,
    );
    return false;
  }
  if (Number(marker[2]) === 0) {
    console.log("The review of the head commit has no findings.");
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
      console.log(`${adder}, a maintainer, accepted the findings.`);
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
