import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SLOW_MS, VERY_SLOW_MS, handleEvent } from "./warn-slow-commands.mjs";

const hookPath = fileURLToPath(
  new URL("./warn-slow-commands.mjs", import.meta.url),
);

function bashEvent(fields) {
  return {
    session_id: "session-1",
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_use_id: "tool-1",
    tool_input: { command: "pnpm run check" },
    ...fields,
  };
}

async function makeTimerDirectory(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "slow-hook-test-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("says nothing about a Claude Code command of one minute or less", async () => {
  assert.equal(
    await handleEvent({
      mode: "claude",
      event: bashEvent({ duration_ms: SLOW_MS }),
    }),
    undefined,
  );
  assert.equal(
    await handleEvent({ mode: "claude", event: bashEvent({}) }),
    undefined,
  );
});

test("tells Claude Code about a slow command, with the name of the event", async () => {
  const output = await handleEvent({
    mode: "claude",
    event: bashEvent({
      hook_event_name: "PostToolUseFailure",
      duration_ms: 125_000,
    }),
  });

  assert.equal(output.hookSpecificOutput.hookEventName, "PostToolUseFailure");
  const message = output.hookSpecificOutput.additionalContext;
  assert.match(message, /^The command `pnpm run check` took 2 min 5 s\./);
  assert.match(message, /A slow command makes each step of a loop slow\./);
  assert.doesNotMatch(message, /very slow loop/);
});

test("gives a stronger message after five minutes", async () => {
  const output = await handleEvent({
    mode: "claude",
    event: bashEvent({ duration_ms: VERY_SLOW_MS + 1000 }),
  });

  assert.match(
    output.hookSpecificOutput.additionalContext,
    /took 5 min 1 s\. This is a very slow loop\./,
  );
});

test("shortens a long command to one line", async () => {
  const output = await handleEvent({
    mode: "claude",
    event: bashEvent({
      duration_ms: 90_000,
      tool_input: { command: `echo start\n${"x".repeat(500)}` },
    }),
  });

  const message = output.hookSpecificOutput.additionalContext;
  assert.match(message, /^The command `echo start x+…` took 1 min 30 s\./);
  assert.ok(message.length < 700);
});

test("times a Codex command from its start to its end", async (context) => {
  const timerDirectory = await makeTimerDirectory(context);
  const startedAt = 1_000_000;

  assert.equal(
    await handleEvent({
      mode: "codex-start",
      event: bashEvent({ hook_event_name: "PreToolUse" }),
      now: startedAt,
      timerDirectory,
    }),
    undefined,
  );
  const output = await handleEvent({
    mode: "codex-end",
    event: bashEvent({}),
    now: startedAt + 61_000,
    timerDirectory,
  });

  assert.equal(output.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(
    output.hookSpecificOutput.additionalContext,
    /^The command `pnpm run check` took 1 min 1 s\./,
  );
  assert.deepEqual(await readdir(timerDirectory), []);
});

test("keeps the start times of two Codex commands apart", async (context) => {
  const timerDirectory = await makeTimerDirectory(context);
  await handleEvent({
    mode: "codex-start",
    event: bashEvent({ tool_use_id: "slow" }),
    now: 0,
    timerDirectory,
  });
  await handleEvent({
    mode: "codex-start",
    event: bashEvent({ tool_use_id: "fast" }),
    now: 100_000,
    timerDirectory,
  });

  const fast = await handleEvent({
    mode: "codex-end",
    event: bashEvent({ tool_use_id: "fast" }),
    now: 110_000,
    timerDirectory,
  });
  const slow = await handleEvent({
    mode: "codex-end",
    event: bashEvent({ tool_use_id: "slow" }),
    now: 110_000,
    timerDirectory,
  });

  assert.equal(fast, undefined);
  assert.match(slow.hookSpecificOutput.additionalContext, /took 1 min 50 s\./);
});

test("says nothing at the end of a Codex command with no start time", async (context) => {
  const timerDirectory = await makeTimerDirectory(context);

  assert.equal(
    await handleEvent({
      mode: "codex-end",
      event: bashEvent({}),
      now: 10 * VERY_SLOW_MS,
      timerDirectory,
    }),
    undefined,
  );
});

test("writes the hook output as JSON on stdout", () => {
  const stdout = execFileSync(process.execPath, [hookPath, "claude"], {
    input: JSON.stringify(bashEvent({ duration_ms: 400_000 })),
    encoding: "utf8",
  });

  const output = JSON.parse(stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(
    output.hookSpecificOutput.additionalContext,
    /took 6 min 40 s\. This is a very slow loop\./,
  );
});

test("writes nothing for a fast command", () => {
  const stdout = execFileSync(process.execPath, [hookPath, "claude"], {
    input: JSON.stringify(bashEvent({ duration_ms: 2000 })),
    encoding: "utf8",
  });

  assert.equal(stdout, "");
});
