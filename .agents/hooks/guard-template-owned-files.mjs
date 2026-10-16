// Stops an agent's edit of a file that a project gets from the template.
// Claude Code and Codex run it before each edit, with the agent's name:
//
//   node .agents/hooks/guard-template-owned-files.mjs claude|codex
//
// `templateOwned` in `scripts/template-paths.json` lists the files. A project
// takes their changes only with a sync, because an edit in the project makes
// the next sync conflict. The hook does nothing in the template, which has no
// `template-version.json`, and nothing while a sync waits for a person to
// resolve a conflict.
//
// The hook does not see a file that a shell command writes, so it stops only
// a mistake.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PATHS_FILE,
  VERSION_FILE,
  matchesPath,
} from "../../scripts/template-files.mjs";
import { parsePatchFiles } from "./format-edited-files.mjs";

// The file that `scripts/sync-template.mjs` keeps in the Git directory while
// a template commit is in the working tree.
const SYNC_STOPPED = "template-sync-stopped";
// In these Claude Code modes, nobody sees a prompt, so "ask" would not stop
// the edit or give the agent the reason.
const MODES_WITHOUT_PROMPT = new Set(["bypassPermissions", "dontAsk"]);

function editedPaths(event) {
  const input = event?.tool_input;
  if (typeof input?.file_path === "string") {
    return [input.file_path];
  }
  if (
    event?.tool_name === "apply_patch" &&
    typeof input?.command === "string"
  ) {
    // A deleted file and the old path of a moved file are edits too.
    return parsePatchFiles(input.command).flatMap((file) =>
      file.moveTo ? [file.path, file.moveTo] : [file.path],
    );
  }
  return [];
}

function readGit({ directory, args }) {
  try {
    return execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trimEnd();
  } catch {
    return undefined;
  }
}

/**
 * The repository of a file, and the file's path in it with `/` separators.
 * The file can be new, and it can be under a symbolic link, such as a skill
 * in `.claude/skills/`. The path is then the path of the real file.
 */
function locate(file) {
  let existing = file;
  while (!existsSync(existing)) {
    existing = path.dirname(existing);
  }
  const realExisting = realpathSync(existing);
  const real = path.join(realExisting, path.relative(existing, file));
  const directory = statSync(realExisting).isDirectory()
    ? realExisting
    : path.dirname(realExisting);
  const top = readGit({ directory, args: ["rev-parse", "--show-toplevel"] });
  if (!top) {
    return undefined;
  }
  const root = realpathSync(top);
  return {
    root,
    file: path.relative(root, real).split(path.sep).join("/"),
  };
}

function ownedFiles({ root, files }) {
  if (!existsSync(path.join(root, VERSION_FILE))) {
    return [];
  }
  const stopped = readGit({
    directory: root,
    args: ["rev-parse", "--git-path", SYNC_STOPPED],
  });
  if (stopped && existsSync(path.resolve(root, stopped))) {
    return [];
  }
  const pathsFile = path.join(root, PATHS_FILE);
  const owned = existsSync(pathsFile)
    ? (JSON.parse(readFileSync(pathsFile, "utf8")).templateOwned ?? [])
    : [];
  return files.filter((file) =>
    owned.some((entry) => matchesPath({ entry, file })),
  );
}

async function readHookInput() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

async function main() {
  const agent = process.argv[2];
  if (agent !== "claude" && agent !== "codex") {
    throw new Error("Give the agent as the argument: claude or codex.");
  }
  const input = await readHookInput();
  if (!input) {
    return;
  }
  const event = JSON.parse(input);
  const cwd = typeof event.cwd === "string" ? event.cwd : process.cwd();

  const byRoot = new Map();
  for (const edited of editedPaths(event)) {
    const located = locate(path.resolve(cwd, edited));
    if (located) {
      byRoot.set(located.root, [
        ...(byRoot.get(located.root) ?? []),
        located.file,
      ]);
    }
  }
  const owned = [
    ...new Set(
      [...byRoot].flatMap(([root, files]) => ownedFiles({ root, files })),
    ),
  ];
  if (owned.length === 0) {
    return;
  }

  // Codex does not support "ask" yet. It reports the hook as failed and
  // makes the edit, so its answer must be "deny".
  const decision =
    agent === "claude" && !MODES_WITHOUT_PROMPT.has(event.permission_mode)
      ? "ask"
      : "deny";
  // A person reads the reason in the prompt. An agent reads it when the edit
  // is denied, also when Claude Code denies an "ask" that nobody can answer.
  const names = owned.map((file) => `\`${file}\``).join(", ");
  const reason = [
    `${names} ${owned.length === 1 ? "comes" : "come"} from the template`,
    `(\`templateOwned\` in \`${PATHS_FILE}\`). This project takes changes to`,
    "those files only with a sync, and an edit here makes the next sync",
    "conflict. Make the change in the template first. An agent must not",
    "write these files in another way, such as with a shell command. It",
    "describes the change to the person.",
  ].join(" ");
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }),
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((error) => {
    console.error(`[template-owned-hook] ${error.message}`);
    process.exitCode = 1;
  });
}
