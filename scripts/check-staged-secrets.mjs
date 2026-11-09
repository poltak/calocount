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
const DIFF = [
  "diff",
  "--cached",
  "--diff-filter=ACMRT",
  "--no-color",
  "--no-ext-diff",
];

if (process.env.SKIP_SECRET_CHECK === "1") {
  console.error("SKIP_SECRET_CHECK=1, so the secret check did not run.");
  process.exit(0);
}

function git(...args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.error?.message);
    process.exit(2);
  }
  return result.stdout;
}

const found = [];
// The names come from `-z`, because a patch quotes a name that has unusual
// characters. So the script asks for the patch of each file by its name.
const names = git(...DIFF, "--name-only", "-z")
  .split("\0")
  .filter(Boolean);
for (const name of names) {
  const base = path.posix.basename(name);
  for (const { kind, name: pattern } of SECRET_FILES) {
    if (pattern.test(base) && !ALLOWED_FILES.test(base)) {
      found.push(`${name}: ${kind}`);
    }
  }
  // A file that replaces a symbolic link has two sections. The lines before
  // the first hunk of a section are its header, such as `+++ b/name`.
  const patch = git("--literal-pathspecs", ...DIFF, "-U0", "--", name);
  let line;
  for (const text of patch.split("\n")) {
    const hunk = text.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (text.startsWith("diff --git ")) {
      line = undefined;
    } else if (hunk) {
      line = Number(hunk[1]);
    } else if (line !== undefined && text.startsWith("+")) {
      for (const { kind, pattern } of SECRET_PATTERNS) {
        if (pattern.test(text)) found.push(`${name}:${line}: ${kind}`);
      }
      line += 1;
    }
  }
}

if (found.length > 0) {
  console.error(
    [
      "The staged changes have what looks like a secret, so the commit stopped:",
      "",
      ...found.map((entry) => `  ${entry}`),
      "",
      "Remove each one from the commit, for example with `git restore --staged <file>`.",
      "Keep secrets in `.env`, which Git ignores. A secret in a pushed commit stays",
      "on GitHub, so revoke it and make a new one.",
      "",
      "When each one is not a secret, such as a key that only a test uses, commit",
      "again with SKIP_SECRET_CHECK=1 in the environment. An agent asks its person",
      "before it does this.",
    ].join("\n"),
  );
  process.exit(1);
}
