import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  extractTargetPaths,
  formatChangedFiles,
  resolveGitRoot,
  resolveSafeFiles,
} from "./format-edited-files.mjs";

const hookDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = await resolveGitRoot(path.resolve(hookDirectory, "../.."));

test("extracts Claude Edit and Write file paths", () => {
  assert.deepEqual(
    extractTargetPaths({
      tool_name: "Edit",
      tool_input: { file_path: "src/file with spaces.ts" },
    }),
    ["src/file with spaces.ts"],
  );
  assert.deepEqual(
    extractTargetPaths({
      tool_name: "Write",
      tool_input: { file_path: "/repo/new file.ts" },
    }),
    ["/repo/new file.ts"],
  );
});

test("extracts added, updated, and moved patch targets but skips deletions", () => {
  const patch = [
    "*** Begin Patch",
    "*** Add File: src/new file.ts",
    "+export const value=1",
    "*** Update File: src/old file.ts",
    "*** Move to: src/moved file.ts",
    "@@",
    "-const oldValue=1",
    "+const newValue=1",
    "*** Delete File: src/deleted file.ts",
    "*** End Patch",
  ].join("\n");

  assert.deepEqual(
    extractTargetPaths({
      tool_name: "apply_patch",
      tool_input: { command: patch },
    }),
    ["src/new file.ts", "src/moved file.ts"],
  );
});

test("resolves safe files and rejects missing paths and symlinks outside the repo", async (context) => {
  const testDirectory = await mkdtemp(
    path.join(repoRoot, ".format-hook-safety-"),
  );
  const outsideDirectory = await mkdtemp(
    path.join(os.tmpdir(), "format-hook-outside-"),
  );
  context.after(async () => {
    await rm(testDirectory, { recursive: true, force: true });
    await rm(outsideDirectory, { recursive: true, force: true });
  });

  const inRepoFile = path.join(testDirectory, "inside file.js");
  const outsideFile = path.join(outsideDirectory, "outside.js");
  const symlinkPath = path.join(testDirectory, "outside link.js");
  await writeFile(inRepoFile, "const inside=1;\n");
  await writeFile(outsideFile, "const outside=1;\n");
  await symlink(outsideFile, symlinkPath);

  assert.deepEqual(
    await resolveSafeFiles(
      [inRepoFile, symlinkPath, path.join(testDirectory, "missing.js")],
      { repoRoot, cwd: repoRoot },
    ),
    [await realpath(inRepoFile)],
  );
});

test("formats a supported changed file and skips a file in .prettierignore", async (context) => {
  const testDirectory = await mkdtemp(
    path.join(os.tmpdir(), "format-hook-prettier-"),
  );
  context.after(async () =>
    rm(testDirectory, { recursive: true, force: true }),
  );

  execFileSync("git", ["init", "--quiet", testDirectory]);
  await mkdir(path.join(testDirectory, "src"));
  await writeFile(
    path.join(testDirectory, ".prettierignore"),
    "src/ignored.js\n",
  );
  const formattedFile = path.join(testDirectory, "src/formatted.js");
  const ignoredFile = path.join(testDirectory, "src/ignored.js");
  await writeFile(formattedFile, "const value={answer:42}\n");
  await writeFile(ignoredFile, "const ignored={answer:42}\n");

  const changedFiles = await formatChangedFiles([formattedFile, ignoredFile], {
    repoRoot: testDirectory,
    cwd: testDirectory,
  });

  assert.deepEqual(changedFiles, [await realpath(formattedFile)]);
  assert.equal(
    await readFile(formattedFile, "utf8"),
    "const value = { answer: 42 };\n",
  );
  assert.equal(
    await readFile(ignoredFile, "utf8"),
    "const ignored={answer:42}\n",
  );
});

async function readHookCommand(configPath) {
  const config = JSON.parse(
    await readFile(path.join(repoRoot, configPath), "utf8"),
  );
  const [command] = config.hooks.PostToolUse.flatMap((entry) =>
    entry.hooks.map((hook) => hook.command),
  );
  assert.equal(typeof command, "string");
  return command;
}

async function createUnformattedRepoFile(context) {
  const testDirectory = await mkdtemp(
    path.join(repoRoot, ".format-hook-config-"),
  );
  context.after(async () =>
    rm(testDirectory, { recursive: true, force: true }),
  );
  const filePath = path.join(testDirectory, "edited file.js");
  await writeFile(filePath, "const value={answer:42}\n");
  return filePath;
}

function runHookCommand(command, { env = {}, input }) {
  execFileSync("/bin/sh", ["-c", command], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    input: JSON.stringify(input),
    stdio: ["pipe", "pipe", "pipe"],
  });
}

test("runs the configured Claude Code hook for an edited file", async (context) => {
  const command = await readHookCommand(".claude/settings.json");
  const filePath = await createUnformattedRepoFile(context);

  runHookCommand(command, {
    env: { CLAUDE_PROJECT_DIR: repoRoot },
    input: {
      tool_name: "Edit",
      tool_input: { file_path: filePath },
      cwd: repoRoot,
    },
  });

  assert.equal(
    await readFile(filePath, "utf8"),
    "const value = { answer: 42 };\n",
  );
});

test("runs the configured Codex hook for a patched file", async (context) => {
  const command = await readHookCommand(".codex/hooks.json");
  const filePath = await createUnformattedRepoFile(context);
  const relativePath = path.relative(repoRoot, filePath);

  runHookCommand(command, {
    input: {
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          `*** Add File: ${relativePath}`,
          "+const value={answer:42}",
          "*** End Patch",
        ].join("\n"),
      },
      cwd: repoRoot,
    },
  });

  assert.equal(
    await readFile(filePath, "utf8"),
    "const value = { answer: 42 };\n",
  );
});
