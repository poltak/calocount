import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const git = ({ directory, args }) =>
  execFileSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();

async function commit({ directory, file }) {
  await writeFile(path.join(directory, file), `${file}\n`);
  git({ directory, args: ["add", file] });
  git({
    directory,
    args: [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.test",
      "commit",
      "--quiet",
      "-m",
      file,
    ],
  });
}

/**
 * A repository on this machine with one commit on `main`, and a function that
 * pushes more commits to its `main`, as another person does.
 */
async function createRemote({ directory, name }) {
  const url = path.join(directory, `${name}.git`);
  const other = path.join(directory, `${name}-other`);
  git({
    directory,
    args: ["init", "--quiet", "--bare", "--initial-branch=main", url],
  });
  git({ directory, args: ["clone", "--quiet", url, other] });
  git({ directory: other, args: ["symbolic-ref", "HEAD", "refs/heads/main"] });
  const pushToMain = async (files) => {
    for (const file of files) {
      await commit({ directory: other, file });
    }
    git({ directory: other, args: ["push", "--quiet", "origin", "main"] });
  };
  await pushToMain([`${name}-first.txt`]);
  return { url, pushToMain };
}

/** A clone of a repository on this machine, as a person's checkout. */
async function createClones(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "branch-current-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const origin = await createRemote({ directory, name: "origin" });
  const clone = path.join(directory, "clone");
  git({ directory, args: ["clone", "--quiet", origin.url, clone] });
  return { directory, clone, pushToMain: origin.pushToMain };
}

async function readStartCommand(configPath) {
  const config = JSON.parse(
    await readFile(path.join(repoRoot, configPath), "utf8"),
  );
  const commands = config.hooks.SessionStart.flatMap((entry) =>
    entry.hooks.map((hook) => hook.command),
  ).filter((command) => command.includes("check-branch-is-current.mjs"));
  assert.equal(commands.length, 1);
  return commands[0];
}

/** Run the hook as the agent's configuration runs it, and read its output. */
async function runHook({ agent, cwd }) {
  const command = await readStartCommand(
    agent === "claude" ? ".claude/settings.json" : ".codex/hooks.json",
  );
  const output = execFileSync("/bin/sh", ["-c", command], {
    cwd: repoRoot,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoRoot },
    input: JSON.stringify({ hook_event_name: "SessionStart", cwd }),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return output ? JSON.parse(output) : undefined;
}

test("tells both agents when the local main is behind origin/main", async (context) => {
  const { clone, pushToMain } = await createClones(context);
  await pushToMain(["second.txt", "third.txt"]);

  for (const agent of ["claude", "codex"]) {
    const output = await runHook({ agent, cwd: clone });

    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(
      output.hookSpecificOutput.additionalContext,
      output.systemMessage,
    );
    assert.match(
      output.systemMessage,
      /^The local `main` is 2 commits behind `origin\/main`\. Run `git pull --ff-only`/,
    );
  }
});

test("tells the agent to merge origin/main into a branch that is behind it", async (context) => {
  const { clone, pushToMain } = await createClones(context);
  git({ directory: clone, args: ["switch", "--quiet", "-c", "feature"] });
  await pushToMain(["second.txt"]);

  const output = await runHook({ agent: "claude", cwd: clone });

  assert.match(
    output.systemMessage,
    /^The branch `feature` is 1 commit behind `origin\/main`\. Merge `origin\/main` into it before you open a pull request/,
  );
});

test("compares a branch with the main of the remote that it tracks", async (context) => {
  const { directory, clone, pushToMain } = await createClones(context);
  // As a template branch in the repository of a project made from it.
  const template = await createRemote({ directory, name: "template" });
  git({ directory: clone, args: ["remote", "add", "template", template.url] });
  git({ directory: clone, args: ["fetch", "--quiet", "template"] });
  git({
    directory: clone,
    args: ["switch", "--quiet", "-c", "template-change", "template/main"],
  });
  await pushToMain(["second.txt", "third.txt", "fourth.txt"]);
  await template.pushToMain(["template-second.txt"]);

  const output = await runHook({ agent: "codex", cwd: clone });

  assert.match(
    output.systemMessage,
    /^The branch `template-change` is 1 commit behind `template\/main`\. Merge `template\/main` into it/,
  );
});

test("says nothing when the branch has each commit of origin/main", async (context) => {
  const { clone, pushToMain } = await createClones(context);
  await pushToMain(["second.txt"]);
  git({ directory: clone, args: ["pull", "--quiet", "--ff-only"] });
  git({ directory: clone, args: ["switch", "--quiet", "-c", "feature"] });
  await commit({ directory: clone, file: "feature.txt" });

  assert.equal(await runHook({ agent: "claude", cwd: clone }), undefined);
});

test("says nothing when the fetch fails", async (context) => {
  const { clone, pushToMain } = await createClones(context);
  await pushToMain(["second.txt"]);
  git({
    directory: clone,
    args: ["remote", "set-url", "origin", path.join(clone, "missing.git")],
  });

  assert.equal(await runHook({ agent: "codex", cwd: clone }), undefined);
});
