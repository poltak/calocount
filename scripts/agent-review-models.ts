import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CLAUDE_DENIED_TOOLS,
  CLAUDE_TOOLS,
  SCHEMA_FILE,
  root,
} from "./agent-review-constants.ts";
import { promptFor } from "./agent-review-prompt.ts";
import {
  count,
  encode,
  flatten,
  readEvent,
  requireEnv,
  unpack,
  writeOutputs,
} from "./agent-review-shared.ts";
import type { EarlierReview, ModelOutput } from "./agent-review-types.ts";

interface ModelUsage {
  inputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  outputTokens?: number;
}

/** The JSON that `claude -p --output-format json` prints. */
interface ClaudeRun {
  result?: string;
  subtype?: string;
  is_error?: boolean;
  structured_output?: ModelOutput;
  modelUsage?: Record<string, ModelUsage>;
  num_turns?: number;
  total_cost_usd?: number;
}

interface CodexUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
}

const number = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value)
    ? value.toLocaleString("en-US")
    : "?";

// The input of each model includes the tokens from its cache, so that the
// lines of the two models compare.
function tokenText({
  input,
  cached,
  output,
}: {
  input: number | undefined;
  cached: number | undefined;
  output: number | undefined;
}): string {
  return `${number(input)} input tokens, ${number(cached)} of them from the cache, and ${number(output)} output tokens`;
}

const codexHome = (): string =>
  path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), "agent-review-codex");

export function claude(): void {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    console.log("The CLAUDE_CODE_OAUTH_TOKEN secret is not set.");
    writeOutputs({ status: "not-configured" });
    return;
  }
  const result = spawnSync(
    "claude",
    [
      "-p",
      promptFor(readEvent(), unpack<EarlierReview>(process.env.EARLIER_REVIEW)),
      "--model",
      requireEnv("CLAUDE_MODEL"),
      "--effort",
      requireEnv("CLAUDE_EFFORT"),
      "--output-format",
      "json",
      "--json-schema",
      readFileSync(path.join(root, SCHEMA_FILE), "utf8"),
      // The reviewer gets the project's settings and AGENTS.md, and no MCP server.
      "--setting-sources",
      "project",
      "--strict-mcp-config",
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      ...CLAUDE_TOOLS,
      "--disallowedTools",
      ...CLAUDE_DENIED_TOOLS,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  let run: ClaudeRun | undefined;
  try {
    run = JSON.parse(result.stdout) as ClaudeRun;
  } catch {
    run = undefined;
  }
  const findings = run?.structured_output?.findings;
  const notes = run?.structured_output?.notes ?? [];
  const statuses = run?.structured_output?.earlier ?? [];
  if (
    run === undefined ||
    result.status !== 0 ||
    run.is_error ||
    !Array.isArray(findings)
  ) {
    const message = flatten(
      `${run?.result ?? run?.subtype ?? ""} ${result.stderr ?? ""}`,
    ).slice(0, 500);
    console.log(`Claude Code failed with status ${result.status}: ${message}`);
    writeOutputs({
      status: "failed",
      message: message || `exit status ${result.status}`,
    });
    return;
  }
  // `usage` counts only some calls of the run, and `modelUsage` counts each
  // call of each model, as `total_cost_usd` does.
  const calls = Object.values(run.modelUsage ?? {});
  const sum = (key: keyof ModelUsage) =>
    calls.length === 0
      ? undefined
      : calls.reduce((total, call) => total + (call[key] ?? 0), 0);
  const usage = `${tokenText({
    input:
      (sum("inputTokens") ?? NaN) +
      (sum("cacheReadInputTokens") ?? NaN) +
      (sum("cacheCreationInputTokens") ?? NaN),
    cached: sum("cacheReadInputTokens"),
    output: sum("outputTokens"),
  })}, ${run.num_turns} turns, $${run.total_cost_usd?.toFixed(2)} at API prices`;
  console.log(
    `Claude Code: ${count(findings.length, "finding")}, ${count(notes.length, "note")}, ${count(statuses.length, "earlier issue")} checked, ${usage}.`,
  );
  writeOutputs({
    status: "ok",
    findings: encode(findings),
    notes: encode(notes),
    statuses: encode(statuses),
    usage,
  });
}

export function codex(): void {
  const seed = process.env.CODEX_AUTH_JSON;
  if (!seed) {
    console.log("The CODEX_AUTH_JSON secret is not set.");
    writeOutputs({ status: "not-configured" });
    return;
  }
  const home = codexHome();
  mkdirSync(home, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(home, "auth.json"), seed, { mode: 0o600 });
  // Codex keeps the login in this file and not in a keyring, so that
  // `save-codex-login` can read the refreshed login.
  writeFileSync(
    path.join(home, "config.toml"),
    'cli_auth_credentials_store = "file"\n',
  );
  const lastMessage = path.join(home, "last-message.json");
  const environment: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: home };
  delete environment.CODEX_AUTH_JSON;
  const result = spawnSync(
    "codex",
    [
      "exec",
      "--model",
      requireEnv("CODEX_MODEL"),
      "-c",
      `model_reasoning_effort=${process.env.CODEX_EFFORT}`,
      "--disable",
      "multi_agent",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "--cd",
      root,
      "--output-schema",
      path.join(root, SCHEMA_FILE),
      "--output-last-message",
      lastMessage,
      "--json",
      promptFor(readEvent(), unpack<EarlierReview>(process.env.EARLIER_REVIEW)),
    ],
    {
      encoding: "utf8",
      env: environment,
      input: "",
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  let output: ModelOutput | undefined;
  try {
    output = JSON.parse(readFileSync(lastMessage, "utf8")) as ModelOutput;
  } catch {
    output = undefined;
  }
  const findings = output?.findings;
  const notes = output?.notes ?? [];
  const statuses = output?.earlier ?? [];
  if (result.status !== 0 || !Array.isArray(findings)) {
    const message = flatten(result.stderr ?? "").slice(-500);
    console.log(`Codex failed with status ${result.status}: ${message}`);
    writeOutputs({
      status: "failed",
      message: message || `exit status ${result.status}`,
    });
    return;
  }
  const tokens = [...(result.stdout ?? "").matchAll(/"usage":(\{[^}]*\})/g)]
    .map((match) => JSON.parse(match[1] ?? "") as CodexUsage)
    .at(-1);
  // Codex counts the tokens from the cache in `input_tokens`.
  const usage = tokenText({
    input: tokens?.input_tokens,
    cached: tokens?.cached_input_tokens,
    output: tokens?.output_tokens,
  });
  console.log(
    `Codex: ${count(findings.length, "finding")}, ${count(notes.length, "note")}, ${count(statuses.length, "earlier issue")} checked, ${usage}.`,
  );
  writeOutputs({
    status: "ok",
    findings: encode(findings),
    notes: encode(notes),
    statuses: encode(statuses),
    usage,
  });
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .toSorted()
        .map((key) => [key, sortKeys(record[key])]),
    );
  }
  return value;
}

/**
 * Codex refreshes its login when the login is about 8 days old, and the old
 * refresh token then stops working. The next run needs the new login, so the
 * workflow runs this step also when the review failed or was cancelled.
 */
const same = (text: string) => JSON.stringify(sortKeys(JSON.parse(text)));

export function saveCodexLogin(): boolean {
  const seed = process.env.CODEX_AUTH_JSON;
  const file = path.join(codexHome(), "auth.json");
  if (!seed || !existsSync(file)) {
    return true;
  }
  const login = readFileSync(file, "utf8");
  if (same(login) === same(seed)) {
    console.log("The Codex login did not change.");
    return true;
  }
  if (!process.env.GH_TOKEN) {
    console.log(
      [
        "Codex refreshed its login, and the CODEX_AUTH_WRITE_TOKEN secret is not set,",
        "so the CODEX_AUTH_JSON secret now has a login that does not work.",
        "See docs/agents/agent-review.md for a new login.",
        "::error title=Agent review::The Codex login changed, and the workflow cannot save it.",
      ].join("\n"),
    );
    return false;
  }
  execFileSync(
    "gh",
    [
      "secret",
      "set",
      "CODEX_AUTH_JSON",
      "--repo",
      requireEnv("GITHUB_REPOSITORY"),
    ],
    { encoding: "utf8", input: login },
  );
  console.log("Saved the refreshed Codex login in the CODEX_AUTH_JSON secret.");
  return true;
}
