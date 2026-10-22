import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
  new URL("check-staged-secrets.mjs", import.meta.url),
);
// The test builds each value from parts, so that this file has no value that
// the check, or a scanner of GitHub, takes for a secret.
const GITHUB_TOKEN = ["gh", "p_", "A1b2C3d4E5f6".repeat(3)].join("");
const OPENROUTER_KEY = ["sk-or", "-v1-", "0123456789abcdef".repeat(4)].join("");
const PRIVATE_KEY = ["-----BEGIN", "OPENSSH PRIVATE KEY-----"].join(" ");

const git = (directory, ...args) =>
  spawnSync("git", args, { cwd: directory, encoding: "utf8" });

async function repository(context, committed = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "staged-secrets-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  git(directory, "init", "--quiet");
  await writeFile(path.join(directory, ".gitignore"), ".env\n.env.*\n");
  await stage(directory, committed);
  git(
    directory,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "Base",
  );
  return directory;
}

async function stage(directory, files) {
  for (const [name, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), text);
  }
  // A person who commits `.env.production` adds it with `--force`, because
  // `.gitignore` ignores it.
  git(directory, "add", "--force", "--all");
}

function check(directory, env = {}) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: directory,
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

test("passes placeholders, values of tests, and .env.example", async (context) => {
  const directory = await repository(context);
  await stage(directory, {
    ".env.example":
      "BETTER_AUTH_SECRET=\nDATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54320/app\n",
    "docs/setup.md": "It shows a token that starts with `sk-ant-oat01-`.\n",
    "src/auth.test.ts": 'const password = "a-test-password";\n',
  });

  const result = check(directory);

  assert.equal(result.status, 0, result.output);
  assert.equal(result.output, "");
});

test("stops a file of environment variables, a key file, and a token, and does not show the value", async (context) => {
  const directory = await repository(context);
  await stage(directory, {
    ".env.production": "BETTER_AUTH_SECRET=not-a-real-secret\n",
    "deploy/prod.env": "PORT=3000\n",
    "deploy/id_ed25519": "a key\n",
    "src/config.ts": `export const config = {\n  port: 3000,\n  token: "${GITHUB_TOKEN}",\n};\n`,
    "src/service-account.json": `{\n  "private_key": "${PRIVATE_KEY}\\nMIIE"\n}\n`,
    "notes ü.ts": `const key = "${OPENROUTER_KEY}";\n`,
  });

  const result = check(directory);

  assert.equal(result.status, 1, result.output);
  for (const entry of [
    ".env.production: a file of environment variables",
    "deploy/prod.env: a file of environment variables",
    "deploy/id_ed25519: a private key file",
    "src/config.ts:3: a GitHub token",
    "src/service-account.json:2: a private key",
    "notes ü.ts:1: an OpenRouter API key",
  ]) {
    assert.ok(result.output.includes(`\n  ${entry}\n`), result.output);
  }
  assert.doesNotMatch(result.output, /not-a-real-secret|A1b2C3|0123456/);
});

test("reads only the lines that the commit adds, and counts the lines of the staged file", async (context) => {
  const directory = await repository(context, {
    "src/config.ts": `const old = "${GITHUB_TOKEN}";\nconst a = 1;\nconst b = 2;\nconst c = 3;\n`,
  });
  await stage(directory, {
    "src/config.ts": `const old = "${GITHUB_TOKEN}";\nconst a = 10;\nconst c = 3;\n`,
  });
  assert.equal(check(directory).status, 0);

  await stage(directory, {
    "src/config.ts": `const old = "${GITHUB_TOKEN}";\nconst c = 3;\nconst key = "${OPENROUTER_KEY}";\n`,
  });
  const result = check(directory);

  assert.equal(result.status, 1, result.output);
  assert.ok(
    result.output.includes("\n  src/config.ts:3: an OpenRouter API key\n"),
    result.output,
  );
  assert.doesNotMatch(result.output, /GitHub token/);
});

test("checks a file that replaces a symbolic link", async (context) => {
  const directory = await repository(context);
  await symlink("README.md", path.join(directory, "config.ts"));
  git(directory, "add", "config.ts");
  git(
    directory,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--quiet",
    "-m",
    "Link",
  );
  await rm(path.join(directory, "config.ts"));
  await stage(directory, { "config.ts": `const token = "${GITHUB_TOKEN}";\n` });

  const result = check(directory);

  assert.equal(result.status, 1, result.output);
  assert.ok(
    result.output.includes("\n  config.ts:1: a GitHub token\n"),
    result.output,
  );
});

test("SKIP_SECRET_CHECK=1 skips the check", async (context) => {
  const directory = await repository(context);
  await stage(directory, { ".env.production": "PORT=3000\n" });

  const result = check(directory, { SKIP_SECRET_CHECK: "1" });

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /the secret check did not run/);
});
