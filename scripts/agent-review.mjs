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

const LABEL = "agent-review-accepted";
const MARKER = "<!-- agent-review";
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
const COMMENT_FINDING_LIMIT = 50;
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

function promptFor(event) {
  const { base, head } = rangeOf(event);
  return readFileSync(path.join(root, PROMPT_FILE), "utf8")
    .replace("{{PROJECT_RULES}}", () => projectRules())
    .replaceAll("{{BASE}}", base)
    .replaceAll("{{HEAD}}", head)
    .replace("{{PULL_REQUEST}}", () => pullRequestText(event.pull_request));
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
  execFileSync("gh", ["api", "--method", method, route, "--input", "-"], {
    encoding: "utf8",
    input: JSON.stringify(body ?? {}),
  });
}

const encode = (findings) =>
  Buffer.from(JSON.stringify(findings)).toString("base64");
const flatten = (text) => text.replace(/\s+/g, " ").trim();
const count = (number, word) => `${number} ${word}${number === 1 ? "" : "s"}`;
const decode = (text) =>
  text ? JSON.parse(Buffer.from(text, "base64").toString("utf8")) : [];
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
  writeOutputs({ mode });
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
      promptFor(readEvent()),
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
    `Claude Code: ${count(findings.length, "finding")}, ${count(notes.length, "note")}, ${run.num_turns} turns, $${run.total_cost_usd?.toFixed(2)} at API prices.`,
  );
  writeOutputs({
    status: "ok",
    findings: encode(findings),
    notes: encode(notes),
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
      promptFor(readEvent()),
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
    `Codex: ${count(findings.length, "finding")}, ${count(notes.length, "note")}, ${usage?.input_tokens ?? "?"} input and ${usage?.output_tokens ?? "?"} output tokens.`,
  );
  writeOutputs({
    status: "ok",
    findings: encode(findings),
    notes: encode(notes),
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
  if (outputs.status === "not-configured") {
    return { name, model, state: "not-configured", findings: [], notes: [] };
  }
  if (result === "success" && outputs.status === "ok") {
    const withModel = (item) => ({ ...item, models: [name] });
    return {
      name,
      model,
      state: "ok",
      findings: decode(outputs.findings).map(withModel),
      notes: decode(outputs.notes).slice(0, NOTE_LIMIT).map(withModel),
    };
  }
  return {
    name,
    model,
    state: "failed",
    message:
      outputs.message || `The job ended with "${result ?? "no result"}".`,
    findings: [],
    notes: [],
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

/** Merges the findings that quote the same text, and keeps each model. */
function mergeFindings(findings) {
  const merged = [];
  for (const finding of findings) {
    const quote = flatten(finding.quote);
    const same = merged.find(
      (other) =>
        other.file === finding.file &&
        (flatten(other.quote).includes(quote) ||
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

function commentFor({ repository, head, findings, notes, models, deleted }) {
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const link = ({ file, line }) =>
    `[\`${file}${line ? `:${line}` : ""}\`](${server}/${repository}/blob/${head}/${encodeURI(file)}${line ? `#L${line}` : ""})`;
  const failed = models.filter((model) => model.state === "failed");
  const blockers = findings.length + failed.length;
  const lines = [
    `${MARKER} head=${head} blockers=${blockers} -->`,
    `### Agent review of ${head.slice(0, 7)}: ${findings.length === 0 ? "no findings" : count(findings.length, "finding")}`,
    "",
  ];
  const entry = (item, title) => [
    `**${title}** in ${link(item)} (${item.models.join(", ")})`,
    "",
    quoteBlock(item.quote),
    "",
    escapeHtml(flatten(item.explanation)).slice(0, 1000),
    "",
  ];
  findings.slice(0, COMMENT_FINDING_LIMIT).forEach((finding, index) => {
    lines.push(...entry(finding, `${index + 1}. ${finding.rule}`));
  });
  if (findings.length > COMMENT_FINDING_LIMIT) {
    lines.push(
      `${findings.length - COMMENT_FINDING_LIMIT} more findings are in the log of the workflow.`,
      "",
    );
  }
  if (notes.length > 0) {
    lines.push(
      "#### Other notes",
      "",
      "No rule covers these notes, and they do not fail the check.",
      "",
    );
    notes.forEach((note, index) => {
      lines.push(...entry(note, `${index + 1}.`));
    });
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
    const rules = [PROMPT_FILE, PROJECT_RULES_FILE]
      .filter((file) => existsSync(path.join(root, file)))
      .map((file) => link({ file }))
      .join(" and ");
    lines.push(
      "",
      `The rules are in ${rules}. When each finding is wrong or accepted, a maintainer adds the \`${LABEL}\` label. A later review with findings removes the label.`,
    );
  }
  return { body: lines.join("\n"), blockers };
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

  const found = [
    ...models.flatMap((model) => model.findings),
    ...newDocuments(rangeOf(event)),
  ];
  const rules = ruleNames();
  const deleted = { quote: 0, rule: 0 };
  const kept = found.filter((finding) => {
    const reason = !rules.has(finding.rule)
      ? "rule"
      : !quoteIsInFile(finding)
        ? "quote"
        : undefined;
    if (reason) {
      deleted[reason] += 1;
      console.log(
        `Deleted a finding of ${finding.models.join(", ")}, because ${reason === "rule" ? `"${finding.rule}" is not a rule of the review` : `its quote is not in ${finding.file}`}: ${flatten(finding.quote).slice(0, 200)}`,
      );
    }
    return !reason;
  });
  const findings = mergeFindings(kept);
  const allNotes = models.flatMap((model) => model.notes);
  const notes = mergeFindings(allNotes.filter(quoteIsInFile));
  deleted.quote += allNotes.length - allNotes.filter(quoteIsInFile).length;
  const { body, blockers } = commentFor({
    repository,
    head,
    findings,
    notes,
    models,
    deleted,
  });
  console.log(body);

  const previous = stickyComment({ repository, number: pull.number });
  if (previous) {
    // GitHub keeps each earlier version of an edited comment, so a later run
    // does not hide the findings of an earlier one.
    callApi({
      method: "PATCH",
      route: `repos/${repository}/issues/comments/${previous.id}`,
      body: { body },
    });
  } else {
    callApi({
      method: "POST",
      route: `repos/${repository}/issues/${pull.number}/comments`,
      body: { body },
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
    /^<!-- agent-review head=(\w+) blockers=(\d+) -->/,
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
