import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { runProjectHooks } from "./run-project-hooks.ts";

interface Entry {
  name: string;
  script: string;
  tools?: string[];
}

async function createProject(
  context: TestContext,
  {
    hooks,
    scripts = {},
  }: { hooks?: unknown; scripts?: Record<string, string> },
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "project-hooks-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const folder = path.join(root, ".agents/project-hooks");
  await mkdir(folder, { recursive: true });
  if (hooks !== undefined) {
    await writeFile(
      path.join(folder, "hooks.json"),
      typeof hooks === "string" ? hooks : JSON.stringify(hooks),
    );
  }
  for (const [file, text] of Object.entries(scripts)) {
    await writeFile(path.join(folder, file), text);
  }
  return root;
}

const printing = (value: unknown) =>
  `process.stdout.write(${JSON.stringify(JSON.stringify(value))});\n`;
const denying = (reason = "no") => printing({ decision: "deny", reason });
const asking = (reason = "sure?") => printing({ decision: "ask", reason });

const event = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({ tool_name: "Bash", ...fields });

function parse(output: string | null) {
  assert.ok(output);
  return JSON.parse(output).hookSpecificOutput as {
    hookEventName: string;
    permissionDecision: string;
    permissionDecisionReason: string;
  };
}

// A test that does not check the time limit must not fail on a slow machine,
// where a Node process can take seconds to start.
const SLOW_MACHINE_MS = 60_000;

async function run(
  context: TestContext,
  {
    entries,
    scripts,
    agent = "claude",
    input = event(),
    timeoutMs = SLOW_MACHINE_MS,
  }: {
    entries: Entry[];
    scripts: Record<string, string>;
    agent?: string;
    input?: string;
    timeoutMs?: number;
  },
) {
  const root = await createProject(context, {
    hooks: { preToolUse: entries },
    scripts,
  });
  return runProjectHooks({ root, agent, input, timeoutMs });
}

test("prints nothing when the project has no hooks folder", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "project-hooks-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(
    await runProjectHooks({
      root,
      agent: "claude",
      input: event(),
      timeoutMs: SLOW_MACHINE_MS,
    }),
    null,
  );
});

test("allows when a hook prints nothing", async (context) => {
  const output = await run(context, {
    entries: [{ name: "quiet", script: "quiet.ts" }],
    scripts: { "quiet.ts": "" },
  });
  assert.equal(output, null);
});

test("denies with the reason of the hook and its name", async (context) => {
  const answer = parse(
    await run(context, {
      entries: [{ name: "guard", script: "g.ts" }],
      scripts: { "g.ts": denying("secret") },
    }),
  );
  assert.equal(answer.hookEventName, "PreToolUse");
  assert.equal(answer.permissionDecision, "deny");
  assert.equal(answer.permissionDecisionReason, "[guard] secret");
});

test("asks for Claude Code", async (context) => {
  const answer = parse(
    await run(context, {
      entries: [{ name: "guard", script: "g.ts" }],
      scripts: { "g.ts": asking() },
    }),
  );
  assert.equal(answer.permissionDecision, "ask");
  assert.equal(answer.permissionDecisionReason, "[guard] sure?");
});

test("turns ask into deny for Codex", async (context) => {
  const answer = parse(
    await run(context, {
      agent: "codex",
      entries: [{ name: "guard", script: "g.ts" }],
      scripts: { "g.ts": asking() },
    }),
  );
  assert.equal(answer.permissionDecision, "deny");
});

test("turns ask into deny in the modes without a prompt", async (context) => {
  for (const mode of ["bypassPermissions", "dontAsk"]) {
    const answer = parse(
      await run(context, {
        input: event({ permission_mode: mode }),
        entries: [{ name: "guard", script: "g.ts" }],
        scripts: { "g.ts": asking() },
      }),
    );
    assert.equal(answer.permissionDecision, "deny", mode);
  }
});

test("runs a hook only for the tools that it lists", async (context) => {
  const entries = [{ name: "reads", script: "g.ts", tools: ["Read"] }];
  const scripts = { "g.ts": denying() };
  assert.equal(await run(context, { entries, scripts }), null);
  const answer = parse(
    await run(context, {
      entries,
      scripts,
      input: event({ tool_name: "Read" }),
    }),
  );
  assert.equal(answer.permissionDecision, "deny");
});

test("a deny wins over an ask, and the run stops at the first deny", async (context) => {
  const root = await createProject(context, {
    hooks: {
      preToolUse: [
        { name: "first", script: "ask.ts" },
        { name: "second", script: "deny.ts" },
        { name: "third", script: "marker.ts" },
      ],
    },
    scripts: { "ask.ts": asking(), "deny.ts": denying("stop") },
  });
  const marker = path.join(root, "third-ran");
  await writeFile(
    path.join(root, ".agents/project-hooks/marker.ts"),
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "x");\n`,
  );
  const answer = parse(
    await runProjectHooks({
      root,
      agent: "claude",
      input: event(),
      timeoutMs: SLOW_MACHINE_MS,
    }),
  );
  assert.equal(answer.permissionDecision, "deny");
  assert.equal(answer.permissionDecisionReason, "[second] stop");
  await assert.rejects(readFile(marker));
});

test("gives the hook the event, the agent, and the root as cwd", async (context) => {
  const root = await createProject(context, {
    hooks: { preToolUse: [{ name: "probe", script: "probe.ts" }] },
  });
  const seen = path.join(root, "seen.json");
  await writeFile(
    path.join(root, ".agents/project-hooks/probe.ts"),
    `import { readFileSync, writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(seen)}, JSON.stringify({
  input: readFileSync(0, "utf8"),
  agent: process.argv[2],
  cwd: process.cwd(),
}));
`,
  );
  const input = event({ tool_input: { command: "ls" } });
  await runProjectHooks({
    root,
    agent: "codex",
    input,
    timeoutMs: SLOW_MACHINE_MS,
  });
  const result = JSON.parse(await readFile(seen, "utf8"));
  assert.equal(result.input, input);
  assert.equal(result.agent, "codex");
  assert.equal(await realpath(result.cwd), await realpath(root));
});

async function assertDenied({
  output,
  includes,
}: {
  output: string | null;
  includes: string[];
}) {
  const answer = parse(output);
  assert.equal(answer.permissionDecision, "deny");
  for (const text of includes) {
    assert.ok(
      answer.permissionDecisionReason.includes(text),
      `${answer.permissionDecisionReason} should include ${text}`,
    );
  }
  return answer;
}

test("denies when hooks.json is not JSON", async (context) => {
  const root = await createProject(context, { hooks: "{ nope" });
  await assertDenied({
    output: await runProjectHooks({
      root,
      agent: "claude",
      input: event(),
      timeoutMs: SLOW_MACHINE_MS,
    }),
    includes: ["project-hooks", "hooks.json"],
  });
});

test("denies when hooks.json has an unknown key", async (context) => {
  for (const hooks of [
    { postToolUse: [] },
    { preToolUse: [{ name: "a", script: "a.ts", extra: 1 }] },
  ]) {
    const root = await createProject(context, { hooks });
    await assertDenied({
      output: await runProjectHooks({
        root,
        agent: "claude",
        input: event(),
        timeoutMs: SLOW_MACHINE_MS,
      }),
      includes: ["unknown key"],
    });
  }
});

test("denies when the list of hooks is null", async (context) => {
  const root = await createProject(context, { hooks: { preToolUse: null } });
  await assertDenied({
    output: await runProjectHooks({
      root,
      agent: "claude",
      input: event(),
      timeoutMs: SLOW_MACHINE_MS,
    }),
    includes: ["must be a list"],
  });
});

test("denies when a hook has no name or no script", async (context) => {
  for (const hooks of [
    { preToolUse: [{ script: "a.ts" }] },
    { preToolUse: [{ name: "a" }] },
  ]) {
    const root = await createProject(context, { hooks });
    await assertDenied({
      output: await runProjectHooks({
        root,
        agent: "claude",
        input: event(),
        timeoutMs: SLOW_MACHINE_MS,
      }),
      includes: ["needs"],
    });
  }
});

test("denies when the script is outside the folder", async (context) => {
  const output = await run(context, {
    entries: [{ name: "out", script: "../x.ts" }],
    scripts: {},
  });
  await assertDenied({ output, includes: ["[out]", "outside"] });
});

test("denies when the script is missing", async (context) => {
  const output = await run(context, {
    entries: [{ name: "gone", script: "gone.ts" }],
    scripts: {},
  });
  await assertDenied({ output, includes: ["[gone]", "does not exist"] });
});

test("denies when a hook exits with an error, and names the first line of stderr only", async (context) => {
  const output = await run(context, {
    entries: [{ name: "crash", script: "c.ts" }],
    scripts: {
      "c.ts": `console.error("bad thing\\nsecond line");\nprocess.exit(3);\n`,
    },
    input: event({ tool_input: { command: "SECRET-EVENT-TEXT" } }),
  });
  const answer = await assertDenied({
    output,
    includes: ["[crash]", "code 3", "bad thing"],
  });
  assert.ok(!answer.permissionDecisionReason.includes("second line"));
  assert.ok(!answer.permissionDecisionReason.includes("SECRET-EVENT-TEXT"));
});

test("denies when a hook takes too long", async (context) => {
  const output = await run(context, {
    entries: [{ name: "slow", script: "s.ts" }],
    scripts: { "s.ts": "setTimeout(() => {}, 30000);\n" },
    timeoutMs: 300,
  });
  await assertDenied({ output, includes: ["[slow]", "300 ms"] });
});

test("denies at its limit when a process of the hook keeps the pipes", async (context) => {
  const started = Date.now();
  const output = await run(context, {
    entries: [{ name: "child", script: "c.ts" }],
    scripts: {
      "c.ts": [
        'import { spawn } from "node:child_process";',
        "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {",
        '  stdio: "inherit",',
        "}).unref();",
        "setTimeout(() => {}, 30000);",
        "",
      ].join("\n"),
    },
    timeoutMs: 1000,
  });
  await assertDenied({ output, includes: ["[child]", "1000 ms"] });
  assert.ok(Date.now() - started < 20000);
});

test("denies when a hook prints output that is not the contract", async (context) => {
  for (const text of [
    `process.stdout.write("hello");\n`,
    printing({ decision: "allow", reason: "x" }),
    printing({ decision: "deny" }),
    printing({ decision: "deny", reason: "x", more: 1 }),
  ]) {
    const output = await run(context, {
      entries: [{ name: "odd", script: "o.ts" }],
      scripts: { "o.ts": text },
    });
    await assertDenied({ output, includes: ["[odd]", "output"] });
  }
});
