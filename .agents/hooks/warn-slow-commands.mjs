// Tells the agent when a shell command was slow. An agent that runs minutes of
// tests after each small change wastes most of its time in that loop, and it
// does not see the time that each command takes.
//
// Claude Code gives the time of a command in `duration_ms`, and runs the hook
// after each Bash command:
//
//   node .agents/hooks/warn-slow-commands.mjs claude
//
// Codex gives no time, so it runs the hook before and after each command:
//
//   node .agents/hooks/warn-slow-commands.mjs codex-start|codex-end
//
// `codex-start` writes the start time to a file in the temporary directory,
// and `codex-end` reads and deletes the file. A command that Codex stops
// before its end leaves its file, which the system removes with the other
// temporary files.
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SLOW_MS = 60_000;
export const VERY_SLOW_MS = 5 * 60_000;
const MAX_COMMAND_LENGTH = 200;

export const DEFAULT_TIMER_DIRECTORY = path.join(
  os.tmpdir(),
  "agent-command-timers",
);

function formatDuration(durationMs) {
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds} s`;
  }
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function shortCommand(command) {
  if (typeof command !== "string") {
    return "The command";
  }
  const oneLine = command.replace(/\s+/g, " ").trim();
  const text =
    oneLine.length > MAX_COMMAND_LENGTH
      ? `${oneLine.slice(0, MAX_COMMAND_LENGTH)}…`
      : oneLine;
  return `The command \`${text}\``;
}

export function slowCommandMessage({ command, durationMs }) {
  if (!Number.isFinite(durationMs) || durationMs <= SLOW_MS) {
    return undefined;
  }

  const took = `${shortCommand(command)} took ${formatDuration(durationMs)}.`;
  const checks =
    'The "Checks" section of AGENTS.md gives the fast checks to run while you work.';
  if (durationMs > VERY_SLOW_MS) {
    return [
      took,
      "This is a very slow loop. Do not run this command again after each small change.",
      "Run only the checks of the code that you changed, such as the tests of one file or one feature, and run the full checks one time at the end.",
      checks,
    ].join(" ");
  }
  return [
    took,
    "A slow command makes each step of a loop slow.",
    "If you run it again after each change, run only the checks of the code that you changed, and run the full checks one time at the end.",
    checks,
  ].join(" ");
}

function timerFile({ event, timerDirectory }) {
  if (typeof event?.tool_use_id !== "string" || event.tool_use_id === "") {
    return undefined;
  }
  const key = createHash("sha256")
    .update(`${event.session_id ?? ""}\n${event.tool_use_id}`)
    .digest("hex");
  return path.join(timerDirectory, `${key}.json`);
}

async function codexDuration({ event, now, timerDirectory }) {
  const file = timerFile({ event, timerDirectory });
  if (!file) {
    return undefined;
  }
  let startedAt;
  try {
    startedAt = JSON.parse(await readFile(file, "utf8")).startedAt;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }
    throw error;
  } finally {
    await rm(file, { force: true });
  }
  return Number.isFinite(startedAt) ? now - startedAt : undefined;
}

/**
 * The JSON that the hook writes to stdout, or `undefined` when the hook has
 * nothing to say. `now` and `timerDirectory` are inputs so that a test can
 * set them.
 */
export async function handleEvent({
  mode,
  event,
  now = Date.now(),
  timerDirectory = DEFAULT_TIMER_DIRECTORY,
}) {
  if (mode === "codex-start") {
    const file = timerFile({ event, timerDirectory });
    if (file) {
      await mkdir(timerDirectory, { recursive: true });
      await writeFile(file, JSON.stringify({ startedAt: now }), "utf8");
    }
    return undefined;
  }

  let durationMs;
  if (mode === "claude") {
    durationMs = event?.duration_ms;
  } else if (mode === "codex-end") {
    durationMs = await codexDuration({ event, now, timerDirectory });
  } else {
    throw new Error(
      `Unknown mode "${mode}". Use claude, codex-start, or codex-end.`,
    );
  }

  const message = slowCommandMessage({
    command: event?.tool_input?.command,
    durationMs,
  });
  if (!message) {
    return undefined;
  }
  return {
    hookSpecificOutput: {
      // Claude Code runs the hook for PostToolUseFailure also, and the name
      // in the output must be the name of the event.
      hookEventName: event?.hook_event_name ?? "PostToolUse",
      additionalContext: message,
    },
  };
}

async function readHookInput() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

async function main() {
  const input = await readHookInput();
  if (!input) {
    return;
  }
  const output = await handleEvent({
    mode: process.argv[2],
    event: JSON.parse(input),
  });
  if (output) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((error) => {
    console.error(`[slow-command-hook] ${error.message}`);
    process.exitCode = 1;
  });
}
