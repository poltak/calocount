import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
  new URL("check-staged-file-size.mjs", import.meta.url),
);
const LIMIT = 20_000;
const text = (bytes) => "a".repeat(bytes - 1) + "\n";

const git = (directory, ...args) =>
  spawnSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { cwd: directory, encoding: "utf8" },
  );

async function repository(context, committed = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "staged-size-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  git(directory, "init", "--quiet", "--initial-branch=main");
  await stage(directory, committed);
  git(directory, "commit", "--quiet", "--allow-empty", "-m", "Base");
  return directory;
}

async function stage(directory, files) {
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), content);
  }
  git(directory, "add", "--all");
}

function check(directory) {
  const result = spawnSync(process.execPath, [SCRIPT, "ignored-argument"], {
    cwd: directory,
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

test("passes files at the limit", async (context) => {
  const directory = await repository(context);
  await stage(directory, {
    "src/at-limit.ts": text(LIMIT),
    "docs/small.md": "# Small\n",
  });

  const result = check(directory);

  assert.equal(result.status, 0, result.output);
  assert.equal(result.output, "");
});

test("stops a new file and a file that grows over the limit, and says how to split them", async (context) => {
  const directory = await repository(context, {
    "src/grows.ts": text(LIMIT - 10),
  });
  await stage(directory, {
    "src/new.ts": text(LIMIT + 1),
    "src/grows.ts": text(LIMIT + 400),
  });

  const result = check(directory);

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /src\/new\.ts: 5,001 tokens, a new file/);
  assert.match(
    result.output,
    /src\/grows\.ts: 5,100 tokens, 410 bytes more than before/,
  );
  assert.match(result.output, /Split each file/);
  assert.match(result.output, /docs\/agents\/code-architecture\.md/);
});

test("passes a file over the limit when the commit makes it smaller, keeps its size, or moves it", async (context) => {
  const directory = await repository(context, {
    "src/shrinks.ts": text(LIMIT * 2),
    "src/same-size.ts": text(LIMIT * 2),
    "src/old-name.ts": text(LIMIT * 2),
  });
  git(directory, "mv", "src/old-name.ts", "src/new-name.ts");
  await stage(directory, {
    "src/shrinks.ts": text(LIMIT * 2 - 100),
    "src/same-size.ts": "b" + text(LIMIT * 2 - 1),
  });

  const result = check(directory);

  assert.equal(result.status, 0, result.output);
});

test("stops a file over the limit that grows when it moves", async (context) => {
  const directory = await repository(context, {
    "src/old-name.ts": text(LIMIT * 2),
  });
  git(directory, "mv", "src/old-name.ts", "src/new-name.ts");
  await stage(directory, { "src/new-name.ts": text(LIMIT * 2 + 50) });

  const result = check(directory);

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /src\/new-name\.ts: /);
});

test("skips binary files, generated files, and links", async (context) => {
  const directory = await repository(context);
  const binary = Buffer.alloc(LIMIT * 2, 1);
  binary[10] = 0;
  await stage(directory, {
    ".gitattributes":
      "pnpm-lock.yaml linguist-generated\nsrc/generated/** linguist-generated=true\n",
    "pnpm-lock.yaml": text(LIMIT * 3),
    "src/generated/routes.ts": text(LIMIT * 2),
    "public/image.png": binary,
  });
  await symlink("pnpm-lock.yaml", path.join(directory, "link.yaml"));
  git(directory, "add", "--all");

  const result = check(directory);

  assert.equal(result.status, 0, result.output);
});

test("reads the staged content, not the working tree", async (context) => {
  const directory = await repository(context);
  await stage(directory, { "src/file.ts": text(LIMIT + 1) });
  await writeFile(path.join(directory, "src/file.ts"), "small\n");

  const result = check(directory);

  assert.equal(result.status, 1, result.output);
});

test("passes the commit that completes a merge", async (context) => {
  const directory = await repository(context, {
    "src/file.ts": text(LIMIT * 2),
  });
  git(directory, "switch", "--quiet", "-c", "other");
  await stage(directory, { "src/file.ts": "b" + text(LIMIT * 2 + 10) });
  git(directory, "commit", "--quiet", "--no-verify", "-m", "Other");
  git(directory, "switch", "--quiet", "main");
  await stage(directory, { "src/file.ts": "c" + text(LIMIT * 2) });
  git(directory, "commit", "--quiet", "-m", "Main");
  git(directory, "merge", "--quiet", "other");
  await stage(directory, { "src/file.ts": "d" + text(LIMIT * 2 + 20) });

  const result = check(directory);

  assert.equal(result.status, 0, result.output);
});
