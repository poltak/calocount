import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const OWNED = ["AGENTS.md", "lint/", ".agents/skills/unslop/"];

/** A project made from the template, with a few of its files. */
async function createProject(context, { version = true } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "template-owned-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", directory]);
  const write = async (file, text) => {
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await writeFile(path.join(directory, file), text);
  };
  if (version) {
    await write("template-version.json", "{}\n");
  }
  await write(
    "scripts/template-paths.json",
    JSON.stringify({ templateOwned: OWNED }),
  );
  await write("AGENTS.md", "# Agent instructions\n");
  await write("lint/rule.mjs", "export {};\n");
  await write(".agents/skills/unslop/SKILL.md", "# Unslop\n");
  await write("docs/agents/decisions.md", "# Decisions\n");
  await mkdir(path.join(directory, ".claude/skills"), { recursive: true });
  await symlink(
    "../../.agents/skills/unslop",
    path.join(directory, ".claude/skills/unslop"),
  );
  return directory;
}

async function readGuardCommand(configPath) {
  const config = JSON.parse(
    await readFile(path.join(repoRoot, configPath), "utf8"),
  );
  const commands = config.hooks.PreToolUse.flatMap((entry) =>
    entry.hooks.map((hook) => hook.command),
  ).filter((command) => command.includes("guard-template-owned-files.mjs"));
  assert.equal(commands.length, 1);
  return commands[0];
}

/** Run the hook as the agent's configuration runs it, and read its answer. */
async function runGuard({ agent, input }) {
  const command = await readGuardCommand(
    agent === "claude" ? ".claude/settings.json" : ".codex/hooks.json",
  );
  const output = execFileSync("/bin/sh", ["-c", command], {
    cwd: repoRoot,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoRoot },
    input: JSON.stringify(input),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return output ? JSON.parse(output).hookSpecificOutput : undefined;
}

const claudeEdit = ({ project, file, mode = "default" }) => ({
  agent: "claude",
  input: {
    tool_name: "Edit",
    tool_input: { file_path: path.join(project, file) },
    cwd: project,
    permission_mode: mode,
  },
});

const codexPatch = ({ project, lines }) => ({
  agent: "codex",
  input: {
    tool_name: "apply_patch",
    tool_input: {
      command: ["*** Begin Patch", ...lines, "*** End Patch"].join("\n"),
    },
    cwd: project,
  },
});

test("asks before Claude Code edits a template-owned file of a project", async (context) => {
  const project = await createProject(context);

  const answer = await runGuard(claudeEdit({ project, file: "AGENTS.md" }));

  assert.equal(answer.hookEventName, "PreToolUse");
  assert.equal(answer.permissionDecision, "ask");
  assert.match(
    answer.permissionDecisionReason,
    /`AGENTS\.md` comes from the template/,
  );
  assert.match(answer.permissionDecisionReason, /must not write these files/);
});

test("denies the edit in a Claude Code mode that shows no prompt", async (context) => {
  const project = await createProject(context);

  for (const mode of ["bypassPermissions", "dontAsk"]) {
    const answer = await runGuard(
      claudeEdit({ project, file: "AGENTS.md", mode }),
    );

    assert.equal(answer.permissionDecision, "deny");
    assert.match(
      answer.permissionDecisionReason,
      /describes the change to the person\.$/,
    );
  }
});

test("denies a Codex patch that changes, deletes, or moves a template-owned file", async (context) => {
  const project = await createProject(context);

  const changed = await runGuard(
    codexPatch({
      project,
      lines: [
        "*** Update File: AGENTS.md",
        "@@",
        "-# Agent instructions",
        "+# Rules",
      ],
    }),
  );
  const deleted = await runGuard(
    codexPatch({ project, lines: ["*** Delete File: lint/rule.mjs"] }),
  );
  const moved = await runGuard(
    codexPatch({
      project,
      lines: [
        "*** Update File: lint/rule.mjs",
        "*** Move to: scripts/rule.mjs",
      ],
    }),
  );

  for (const answer of [changed, deleted, moved]) {
    assert.equal(answer.permissionDecision, "deny");
  }
  assert.match(deleted.permissionDecisionReason, /`lint\/rule\.mjs`/);
  assert.match(moved.permissionDecisionReason, /`lint\/rule\.mjs` comes/);
});

test("finds a new file in a template-owned directory, and a file under a skill link", async (context) => {
  const project = await createProject(context);

  const added = await runGuard({
    agent: "claude",
    input: {
      tool_name: "Write",
      tool_input: { file_path: path.join(project, "lint/new/rule.mjs") },
      cwd: project,
    },
  });
  const linked = await runGuard(
    claudeEdit({ project, file: ".claude/skills/unslop/SKILL.md" }),
  );

  assert.equal(added.permissionDecision, "ask");
  assert.match(added.permissionDecisionReason, /`lint\/new\/rule\.mjs`/);
  assert.equal(linked.permissionDecision, "ask");
  assert.match(
    linked.permissionDecisionReason,
    /`\.agents\/skills\/unslop\/SKILL\.md`/,
  );
});

test("allows an edit of a file that the project owns", async (context) => {
  const project = await createProject(context);

  assert.equal(
    await runGuard(claudeEdit({ project, file: "docs/agents/decisions.md" })),
    undefined,
  );
  assert.equal(
    await runGuard(
      codexPatch({
        project,
        lines: ["*** Add File: docs/agents/new.md", "+# New"],
      }),
    ),
    undefined,
  );
});

test("allows each edit in the template, and while a sync waits at a conflict", async (context) => {
  const template = await createProject(context, { version: false });
  const project = await createProject(context);
  await writeFile(
    path.join(project, ".git/template-sync-stopped"),
    JSON.stringify({ commit: "0".repeat(40) }),
  );

  assert.equal(
    await runGuard(claudeEdit({ project: template, file: "AGENTS.md" })),
    undefined,
  );
  assert.equal(
    await runGuard(claudeEdit({ project, file: "AGENTS.md" })),
    undefined,
  );
});

test("each template-owned path of this repository exists", async () => {
  const { templateOwned } = JSON.parse(
    await readFile(path.join(repoRoot, "scripts/template-paths.json"), "utf8"),
  );

  for (const entry of templateOwned) {
    assert.ok(existsSync(path.join(repoRoot, entry)), `${entry} is missing`);
  }
});
