// Runs the PreToolUse hooks that a project lists in
// `.agents/project-hooks/hooks.json`. Claude Code and Codex run it before a
// tool call, with the agent's name:
//
//   pnpm exec node .agents/hooks/run-project-hooks.ts claude|codex
//
// `docs/agents/project-hooks.md` has the contract of a project hook.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS_FOLDER = ".agents/project-hooks";
const HOOKS_FILE = "hooks.json";
// The settings of the agents give a hook 10 s.
const HOOK_TIMEOUT_MS = 8000;
// Same rule as `MODES_WITHOUT_PROMPT` in `guard-template-owned-files.ts`. In
// these Claude Code modes, nobody sees a prompt, so "ask" would not stop the
// call or give the agent the reason.
const MODES_WITHOUT_PROMPT = new Set<string | undefined>([
  "bypassPermissions",
  "dontAsk",
]);

interface ProjectHook {
  name: string;
  script: string;
  tools?: string[];
}

interface Verdict {
  decision: "deny" | "ask";
  reason: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseHooks(text: string): ProjectHook[] {
  const config: unknown = JSON.parse(text);
  if (!isRecord(config)) {
    throw new Error("hooks.json must hold an object.");
  }
  for (const key of Object.keys(config)) {
    if (key !== "preToolUse") {
      throw new Error(`hooks.json has an unknown key: ${key}.`);
    }
  }
  // An absent key means no hooks. A key with null is an error, not an empty
  // list, so that a mistake cannot turn the guards off.
  const list = "preToolUse" in config ? config["preToolUse"] : [];
  if (!Array.isArray(list)) {
    throw new Error("`preToolUse` must be a list.");
  }
  return list.map((entry: unknown, index): ProjectHook => {
    if (!isRecord(entry)) {
      throw new Error(`Hook ${index + 1} must be an object.`);
    }
    for (const key of Object.keys(entry)) {
      if (!["name", "script", "tools"].includes(key)) {
        throw new Error(`Hook ${index + 1} has an unknown key: ${key}.`);
      }
    }
    const { name, script, tools } = entry;
    if (typeof name !== "string" || name === "") {
      throw new Error(`Hook ${index + 1} needs a \`name\` that is text.`);
    }
    if (typeof script !== "string" || script === "") {
      throw new Error(`Hook ${name} needs a \`script\` that is text.`);
    }
    if (
      tools !== undefined &&
      (!Array.isArray(tools) ||
        tools.length === 0 ||
        tools.some((tool) => typeof tool !== "string"))
    ) {
      throw new Error(
        `Hook ${name}: \`tools\` must be a list of tool names, not empty.`,
      );
    }
    return {
      name,
      script,
      ...(tools ? { tools: tools as string[] } : {}),
    };
  });
}

function insideFolder({
  folder,
  file,
}: {
  folder: string;
  file: string;
}): boolean {
  const relative = path.relative(folder, file);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

function resolveScript({
  folder,
  script,
}: {
  folder: string;
  script: string;
}): string {
  const file = path.resolve(folder, script);
  if (!insideFolder({ folder, file })) {
    throw new Error(`The script ${script} is outside ${HOOKS_FOLDER}/.`);
  }
  if (!existsSync(file)) {
    throw new Error(`The script ${script} does not exist.`);
  }
  // A link in the folder must not point out of it.
  if (
    !insideFolder({ folder: realpathSync(folder), file: realpathSync(file) })
  ) {
    throw new Error(`The script ${script} is outside ${HOOKS_FOLDER}/.`);
  }
  return file;
}

function parseVerdict(stdout: string): Verdict | undefined {
  if (stdout.trim() === "") {
    return undefined;
  }
  let answer: unknown;
  try {
    answer = JSON.parse(stdout);
  } catch {
    throw new Error("Its output is not JSON.");
  }
  if (
    !isRecord(answer) ||
    Object.keys(answer).some((key) => key !== "decision" && key !== "reason") ||
    (answer["decision"] !== "deny" && answer["decision"] !== "ask") ||
    typeof answer["reason"] !== "string" ||
    answer["reason"] === ""
  ) {
    throw new Error(
      'Its output must be {"decision": "deny" | "ask", "reason": "<text>"}.',
    );
  }
  return { decision: answer["decision"], reason: answer["reason"] };
}

function runScript({
  root,
  script,
  agent,
  input,
  timeoutMs,
}: {
  root: string;
  script: string;
  agent: string;
  input: string;
  timeoutMs: number;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, agent], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    // The runner decides at its own limit. A process that the hook started
    // can keep the pipes open after the kill, and then "close" comes only
    // when the agent stops the runner, with no decision.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      reject(new Error(`It did not finish in ${timeoutMs} ms.`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    // A hook that exits before it reads the event closes the pipe.
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return;
      } else if (code !== 0) {
        const line = stderr.trim().split("\n")[0] ?? "";
        reject(
          new Error(`It exited with code ${code}${line ? `: ${line}` : "."}`),
        );
      } else {
        resolve(stdout);
      }
    });
    child.stdin.end(input);
  });
}

function toOutput({
  agent,
  mode,
  decision,
  reason,
}: {
  agent: string;
  mode: string | undefined;
  decision: "deny" | "ask";
  reason: string;
}): string {
  // Codex does not support "ask" yet. It reports the hook as failed and runs
  // the tool, so its answer must be "deny".
  const final =
    decision === "ask" && agent === "claude" && !MODES_WITHOUT_PROMPT.has(mode)
      ? "ask"
      : "deny";
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: final,
      permissionDecisionReason: reason,
    },
  });
}

/**
 * The output of the runner for one tool call, or null when the call may go
 * on.
 *
 * A broken hook denies the call. The project relies on its guards, so a
 * guard that fails must not let a call through.
 */
export async function runProjectHooks({
  root,
  agent,
  input,
  timeoutMs = HOOK_TIMEOUT_MS,
}: {
  root: string;
  agent: string;
  input: string;
  timeoutMs?: number | undefined;
}): Promise<string | null> {
  const folder = path.join(root, HOOKS_FOLDER);
  const configFile = path.join(folder, HOOKS_FILE);
  if (!existsSync(configFile)) {
    return null;
  }
  let mode: string | undefined;
  const deny = ({ name, error }: { name: string; error: string }) =>
    toOutput({
      agent,
      mode,
      decision: "deny",
      reason: `[${name}] ${error} A broken project hook denies the tool call.`,
    });

  let hooks: ProjectHook[];
  try {
    hooks = parseHooks(readFileSync(configFile, "utf8"));
  } catch (error) {
    return deny({
      name: "project-hooks",
      error: `${HOOKS_FOLDER}/${HOOKS_FILE} is not valid. ${(error as Error).message}`,
    });
  }
  let toolName: unknown;
  try {
    const event: unknown = JSON.parse(input);
    if (!isRecord(event)) {
      throw new Error("not an object");
    }
    toolName = event["tool_name"];
    if (typeof event["permission_mode"] === "string") {
      mode = event["permission_mode"];
    }
  } catch {
    return deny({
      name: "project-hooks",
      error: "The hook event is not a JSON object.",
    });
  }

  let asked: Verdict | undefined;
  for (const hook of hooks) {
    if (hook.tools && !hook.tools.includes(toolName as string)) {
      continue;
    }
    let verdict: Verdict | undefined;
    try {
      const script = resolveScript({ folder, script: hook.script });
      verdict = parseVerdict(
        await runScript({ root, script, agent, input, timeoutMs }),
      );
    } catch (error) {
      return deny({ name: hook.name, error: (error as Error).message });
    }
    if (verdict?.decision === "deny") {
      return toOutput({
        agent,
        mode,
        decision: "deny",
        reason: `[${hook.name}] ${verdict.reason}`,
      });
    }
    asked ??= verdict && {
      decision: "ask",
      reason: `[${hook.name}] ${verdict.reason}`,
    };
  }
  return asked ? toOutput({ agent, mode, ...asked }) : null;
}

async function main(): Promise<void> {
  const agent = process.argv[2];
  if (agent !== "claude" && agent !== "codex") {
    throw new Error("Give the agent as the argument: claude or codex.");
  }
  const root = path.resolve(import.meta.dirname, "../..");
  if (!existsSync(path.join(root, HOOKS_FOLDER, HOOKS_FILE))) {
    return;
  }
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  const output = await runProjectHooks({ root, agent, input });
  if (output) {
    process.stdout.write(output);
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((error) => {
    console.error(`[project-hooks] ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
