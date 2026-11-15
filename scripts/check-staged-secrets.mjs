// Stops a commit whose staged changes have an obvious secret: a file of
// environment variables, a private key, or a token in a well-known format.
// lint-staged runs it in the pre-commit hook, before Prettier. It reads only
// the lines that the commit adds, so a value that is already in the
// repository does not stop each later commit of its file. The agent review of
// each pull request looks for the secrets and private data that no pattern
// finds.
//
// `SKIP_SECRET_CHECK=1 git commit` skips the check, for a value that is not a
// secret.
//
// With `--branch`, it reads each commit that the branch adds to `main`, and not
// the staged changes. `pnpm run check` runs this mode, and CI runs it too, so a
// commit that the hook did not see stops there, before or after the push. It
// leaves out a commit with a `Not-a-secret: <reason>` line in its message, and
// it warns when `core.hooksPath` is set, because Git then does not run the hook.
import { spawnSync } from "node:child_process";
import path from "node:path";

// `.env.example` is the template of `.env`, and has no real values.
const ALLOWED_FILES = /\.(example|sample|template)$/;
const SECRET_FILES = [
  {
    kind: "a file of environment variables",
    name: /^(\.env(\..+)?|.+\.env)$/,
  },
  {
    kind: "a private key file",
    name: /^id_(rsa|dsa|ecdsa|ed25519)$|\.(key|p12|pfx|jks|keystore)$/,
  },
];
// Only formats with a fixed prefix and length, so that a placeholder such as
// `sk-ant-...` in a document does not stop a commit.
const SECRET_PATTERNS = [
  {
    kind: "a private key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----/,
  },
  { kind: "an AWS access key", pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    kind: "a GitHub token",
    pattern: /\b(gh[pousr]_[A-Za-z0-9]{36}|github_pat_\w{82})\b/,
  },
  { kind: "an Anthropic API key", pattern: /\bsk-ant-[a-z]+\d{2}-[\w-]{80,}/ },
  {
    kind: "an OpenAI API key",
    pattern:
      /\bsk-(proj|svcacct|admin)-[\w-]{40,}|\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/,
  },
  { kind: "an OpenRouter API key", pattern: /\bsk-or-v1-[0-9a-f]{64}\b/ },
  { kind: "a Google API key", pattern: /\bAIza[\w-]{35}\b/ },
  { kind: "a Stripe secret key", pattern: /\b[rs]k_live_[0-9A-Za-z]{24,}/ },
];
const ACCEPTED_COMMIT = /^Not-a-secret: \S/m;
const STAGED_DIFF = [
  "diff",
  "--cached",
  "--diff-filter=ACMRT",
  "--no-color",
  "--no-ext-diff",
];

const runGit = (...args) =>
  spawnSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });

function git(...args) {
  const result = runGit(...args);
  if (result.status !== 0) {
    console.error(result.stderr || result.error?.message);
    process.exit(2);
  }
  return result.stdout;
}

/**
 * What looks like a secret in one file of one change: its name, and the lines
 * that the patch adds. Each entry starts with `label`.
 */
function secretsInFile({ name, patch, label }) {
  const found = [];
  const base = path.posix.basename(name);
  for (const { kind, name: pattern } of SECRET_FILES) {
    if (pattern.test(base) && !ALLOWED_FILES.test(base)) {
      found.push(`${label}: ${kind}`);
    }
  }
  // A file that replaces a symbolic link has two sections. The lines before
  // the first hunk of a section are its header, such as `+++ b/name`.
  let line;
  for (const text of patch.split("\n")) {
    const hunk = text.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (text.startsWith("diff --git ")) {
      line = undefined;
    } else if (hunk) {
      line = Number(hunk[1]);
    } else if (line !== undefined && text.startsWith("+")) {
      for (const { kind, pattern } of SECRET_PATTERNS) {
        if (pattern.test(text)) found.push(`${label}:${line}: ${kind}`);
      }
      line += 1;
    }
  }
  return found;
}

function secretsInStagedChanges() {
  // The names come from `-z`, because a patch quotes a name that has unusual
  // characters. So the script asks for the patch of each file by its name.
  const names = git(...STAGED_DIFF, "--name-only", "-z")
    .split("\0")
    .filter(Boolean);
  return names.flatMap((name) =>
    secretsInFile({
      name,
      patch: git("--literal-pathspecs", ...STAGED_DIFF, "-U0", "--", name),
      label: name,
    }),
  );
}

/** The commit where the branch left `main`, or `undefined` with no `main`. */
function branchBase() {
  return ["origin/main", "main"]
    .map((ref) => runGit("merge-base", "HEAD", ref))
    .find(({ status }) => status === 0)
    ?.stdout.trim();
}

/** The path in `diff --git a/<path> b/<path>`, which has no rename here. */
function pathInHeader(section) {
  const paths = section.slice("diff --git ".length, section.indexOf("\n"));
  return paths.slice(2, (paths.length - 1) / 2);
}

function secretsInBranchCommits() {
  const base = branchBase();
  if (!base) {
    return [];
  }
  const log = git(
    "-c",
    "core.quotePath=false",
    "log",
    "--no-merges",
    "--no-renames",
    "--diff-filter=ACMRT",
    "--no-color",
    "--no-ext-diff",
    "--patch",
    "-U0",
    "--format=%x00%H%x00%B%x00",
    `${base}..HEAD`,
  );
  const fields = log.split("\0");
  const found = [];
  for (let index = 1; index + 2 < fields.length; index += 3) {
    const [commit, message, patch] = fields.slice(index, index + 3);
    if (ACCEPTED_COMMIT.test(message)) {
      continue;
    }
    for (const section of patch.split(/^(?=diff --git )/m)) {
      if (section.startsWith("diff --git ")) {
        const name = pathInHeader(section);
        found.push(
          ...secretsInFile({
            name,
            patch: section,
            label: `${commit.slice(0, 7)} ${name}`,
          }),
        );
      }
    }
  }
  return found;
}

function warnWithoutHook() {
  const hooksPath = runGit("config", "--get", "core.hooksPath").stdout?.trim();
  if (hooksPath) {
    console.error(
      `\`core.hooksPath\` is "${hooksPath}", so Git does not run the pre-commit hook of this repository, and the secret check does not stop a commit. Run \`git config --unset core.hooksPath\`.`,
    );
  }
}

function report(found) {
  console.error(
    [
      BRANCH_MODE
        ? "A commit of this branch has what looks like a secret:"
        : "The staged changes have what looks like a secret, so the commit stopped:",
      "",
      ...found.map((entry) => `  ${entry}`),
      "",
      ...(BRANCH_MODE
        ? [
            "Change that commit before you push it. A secret in a pushed commit stays on",
            "GitHub, so revoke it and make a new one. Keep secrets in `.env`, which Git",
            "ignores.",
            "",
            "When each one is not a secret, such as a key that only a test uses, add the",
            "line `Not-a-secret: <reason>` to the message of the commit. An agent asks its",
            "person before it does this.",
          ]
        : [
            "Remove each one from the commit, for example with `git restore --staged <file>`.",
            "Keep secrets in `.env`, which Git ignores. A secret in a pushed commit stays",
            "on GitHub, so revoke it and make a new one.",
            "",
            "When each one is not a secret, such as a key that only a test uses, commit",
            "again with SKIP_SECRET_CHECK=1 in the environment, and add the line",
            "`Not-a-secret: <reason>` to the commit message, for the check of the branch.",
            "An agent asks its person before it does this.",
          ]),
    ].join("\n"),
  );
}

// lint-staged adds the names of the staged files after the script's name.
const BRANCH_MODE = process.argv[2] === "--branch";

if (process.env.SKIP_SECRET_CHECK === "1") {
  console.error("SKIP_SECRET_CHECK=1, so the secret check did not run.");
  process.exit(0);
}
if (BRANCH_MODE) {
  warnWithoutHook();
}
const found = BRANCH_MODE ? secretsInBranchCommits() : secretsInStagedChanges();
if (found.length > 0) {
  report(found);
  process.exit(1);
}
