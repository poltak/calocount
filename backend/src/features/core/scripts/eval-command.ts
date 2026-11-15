import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readApiKey } from "../evals/api-key.js";
import { createEvalAIService } from "../evals/index.js";
import { costOf, priceOf } from "../evals/model-prices.js";
import type {
  EvalAnswer,
  EvalDefinition,
  EvalMode,
  EvalModel,
} from "../evals/types.js";

// The command line of each eval. docs/agents/evals.md has the commands, the
// options, and the folders.

const REPOSITORY_ROOT = fileURLToPath(
  new URL("../../../../../", import.meta.url),
);

const VALUE_OPTIONS = [
  "cases",
  "runs",
  "mode",
  "model",
  "max-cost",
  "concurrency",
  "replay-from",
];
const BOOLEAN_OPTIONS = ["key-stdin", "dry"];

interface Options<Role extends string> {
  cases: string;
  runs: number;
  mode: EvalMode;
  models: Record<Role, string>;
  maxCost: number;
  concurrency: number;
  keyStdin: boolean;
  dry: boolean;
  replayFrom: string | null;
  flags: Set<string>;
}

// The command only passes the cases, the results, and the scores from one
// function of the definition to the next, so it does not need their types.
type AnyEval = EvalDefinition<string, { id: string }, unknown, unknown>;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function promptsOf(definition: AnyEval): string {
  return Object.values(definition.promptVersions).join("_");
}

/** A folder in the repository that Git does not ignore can go into a commit. */
function gitCanTrack(dir: string): boolean {
  const inRepository = relative(REPOSITORY_ROOT, dir);
  if (inRepository.startsWith("..") || isAbsolute(inRepository)) {
    return false;
  }
  try {
    execFileSync("git", ["check-ignore", "-q", dir], {
      cwd: REPOSITORY_ROOT,
      stdio: "ignore",
    });
    return false;
  } catch {
    return true;
  }
}

function checkDataDir(definition: AnyEval): string {
  const dir = resolve(definition.dataDir);
  if (!existsSync(dir)) {
    throw new Error(`The data folder ${dir} does not exist.`);
  }
  if (definition.privateData && gitCanTrack(dir)) {
    throw new Error(
      `The ${definition.name} eval holds private data, but Git can track its data folder ${dir}. Move the folder out of the repository, or add it to .gitignore.`,
    );
  }
  return dir;
}

function parseOptions(definition: AnyEval, args: string[]): Options<string> {
  const flags = definition.flags ?? [];
  const valueOptions = [
    ...VALUE_OPTIONS,
    ...definition.roles.slice(1).map((role) => `${role}-model`),
  ];
  // A misspelled flag, such as a variant, would give a run of another kind
  // with no error.
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const name = arg.startsWith("--") ? arg.slice(2) : "";
    if (valueOptions.includes(name)) {
      index += 1;
    } else if (![...BOOLEAN_OPTIONS, ...flags].includes(name)) {
      throw new Error(`${arg} is not an option of the ${definition.name} eval`);
    }
  }
  const value = (name: string) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? undefined : args[index + 1];
  };
  const mode = value("mode") ?? "api";
  if (mode !== "api" && mode !== "oracle" && mode !== "null") {
    throw new Error("--mode is api, oracle, or null");
  }
  if (mode === "api" && value("max-cost") === undefined) {
    throw new Error("Give each run a --max-cost limit in dollars");
  }
  // A value that is not a number turns off the cost limit, because each
  // comparison with NaN is false.
  const numberOf = ({
    name,
    fallback,
    min,
  }: {
    name: string;
    fallback: number;
    min: number;
  }) => {
    const number = Number(value(name) ?? fallback);
    if (!Number.isFinite(number) || number < min) {
      throw new Error(`--${name} is a number of ${min} or more`);
    }
    return number;
  };
  const models: Record<string, string> = {};
  for (const [index, role] of definition.roles.entries()) {
    const model =
      value(index === 0 ? "model" : `${role}-model`) ??
      definition.defaultModels[role];
    if (!model) {
      throw new Error(`The ${definition.name} eval has no model for ${role}`);
    }
    models[role] = model;
  }
  return {
    cases: value("cases") ?? "all",
    runs: numberOf({ name: "runs", fallback: 1, min: 1 }),
    mode,
    models,
    maxCost: numberOf({ name: "max-cost", fallback: 0, min: 0 }),
    concurrency: numberOf({ name: "concurrency", fallback: 2, min: 1 }),
    keyStdin: args.includes("--key-stdin"),
    dry: args.includes("--dry"),
    replayFrom: value("replay-from") ?? null,
    flags: new Set(flags.filter((flag) => args.includes(`--${flag}`))),
  };
}

/**
 * The name of the answers folder of the models. A run with another model of
 * a role, with a replay, or with a variant gets a folder of its own.
 */
function modelLabel(definition: AnyEval, options: Options<string>): string {
  const variant = definition.variant?.(options.flags) ?? null;
  const suffix = variant ? `+${variant}` : "";
  if (options.mode !== "api") {
    return `${options.mode}${suffix}`;
  }
  const [main, ...others] = definition.roles;
  const base = options.replayFrom
    ? `replay-${options.replayFrom.split("/")[1] ?? "unknown"}`
    : (options.models[main] ?? main);
  return [
    base,
    ...others.flatMap((role) =>
      options.models[role] === base ? [] : [`${role}-${options.models[role]}`],
    ),
  ]
    .join("+")
    .concat(suffix);
}

/** Each answer of each model of each prompt version, with its folders. */
function readAnswers(
  dataDir: string,
): { prompts: string; model: string; answer: EvalAnswer<unknown> }[] {
  const root = join(dataDir, "answers");
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root).flatMap((prompts) =>
    readdirSync(join(root, prompts)).flatMap((model) =>
      readdirSync(join(root, prompts, model))
        .filter((name) => name.endsWith(".json"))
        .map((name) => ({
          prompts,
          model,
          answer: readJson(
            join(root, prompts, model, name),
          ) as EvalAnswer<unknown>,
        })),
    ),
  );
}

/**
 * The hash of each request that must stay the same within one prompt
 * version: the prompt of each purpose, and the fixed requests of each case.
 * The model is not in a hash, so the answers of all models compare.
 */
function hashesOf(answer: EvalAnswer<unknown>): Map<string, string> {
  const hashes = new Map<string, string>();
  const scope = answer.variant
    ? `${answer.caseId} ${answer.variant}`
    : answer.caseId;
  for (const call of answer.calls) {
    hashes.set(`prompt ${call.purpose}`, call.promptHash);
    if (answer.fixedPurposes.includes(call.purpose)) {
      hashes.set(`${scope} ${call.purpose}`, call.requestHash);
    }
  }
  return hashes;
}

/** The first request that differs from an earlier answer of the same prompt version. */
function changedRequest(
  known: Map<string, string>,
  answer: EvalAnswer<unknown>,
): string | null {
  for (const [name, hash] of hashesOf(answer)) {
    const before = known.get(name);
    if (before !== undefined && before !== hash) {
      return name;
    }
  }
  return null;
}

/** The recorded output of each replayed purpose, by `<case>.r<run>`. */
function recordedOutputs(
  definition: AnyEval,
  dataDir: string,
  folder: string,
): Map<string, Record<string, unknown>> {
  const replay = definition.replay;
  if (!replay) {
    throw new Error(`The ${definition.name} eval has no replay`);
  }
  const dir = join(dataDir, "answers", folder);
  if (!existsSync(dir)) {
    throw new Error(`No answers in ${folder}`);
  }
  const outputs = new Map<string, Record<string, unknown>>();
  for (const file of readdirSync(dir).filter((name) =>
    name.endsWith(".json"),
  )) {
    const answer = readJson(join(dir, file)) as EvalAnswer<unknown>;
    for (const name of replay.promptVersions) {
      if (answer.promptVersions[name] !== definition.promptVersions[name]) {
        throw new Error(
          `${folder} has answers of ${answer.promptVersions[name]}, not ${definition.promptVersions[name]}`,
        );
      }
    }
    outputs.set(
      `${answer.caseId}.r${answer.rep}`,
      Object.fromEntries(
        answer.calls
          .filter(({ purpose }) => replay.purposes.includes(purpose))
          .map(({ purpose, output }) => [purpose, output]),
      ),
    );
  }
  return outputs;
}

function checkCommand(definition: AnyEval): void {
  checkDataDir(definition);
  const cases = definition.loadCases("all");
  const problems = cases.flatMap((evalCase) => definition.check(evalCase));
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  console.log(
    `${cases.length} cases. The cases and the keys have no problems.`,
  );
}

async function runCommand(
  definition: AnyEval,
  options: Options<string>,
): Promise<void> {
  const dataDir = checkDataDir(definition);
  const cases = definition.loadCases(options.cases);
  const problems = cases.flatMap((evalCase) => definition.check(evalCase));
  if (problems.length > 0) {
    throw new Error(`Run check first:\n${problems.join("\n")}`);
  }
  if (options.mode === "api") {
    for (const model of Object.values(options.models)) {
      if (!priceOf(model)) {
        throw new Error(
          `No price for ${model}, so the cost limit cannot work. Add it to PRICES in core/evals/model-prices.ts.`,
        );
      }
    }
  }
  const prompts = promptsOf(definition);
  const label = modelLabel(definition, options);
  const dir = join(dataDir, "answers", prompts, label);
  const replay = options.replayFrom
    ? recordedOutputs(definition, dataDir, options.replayFrom)
    : null;
  const jobs = cases.flatMap((evalCase) =>
    Array.from({ length: options.runs }, (_, index) => ({
      evalCase,
      rep: index + 1,
    })).filter(
      ({ rep }) =>
        !existsSync(join(dir, `${evalCase.id}.r${rep}.json`)) &&
        (!replay || replay.has(`${evalCase.id}.r${rep}`)),
    ),
  );
  const planned =
    options.mode === "api"
      ? definition.estimate({
          cases: jobs.map(({ evalCase }) => evalCase),
          models: options.models,
          replayed: replay ? (definition.replay?.purposes ?? []) : [],
          flags: options.flags,
        })
      : 0;
  console.log(
    `${jobs.length} runs to do for ${label}, prompts ${prompts}. Estimate $${planned.toFixed(2)}, limit $${options.maxCost.toFixed(2)}.`,
  );
  if (jobs.length === 0 || options.dry) {
    return;
  }
  if (planned > options.maxCost) {
    console.log("The estimate is above the limit, so nothing was sent.");
    return;
  }
  const known = new Map<string, string>();
  for (const { prompts: other, answer } of readAnswers(dataDir)) {
    if (other === prompts) {
      for (const [name, hash] of hashesOf(answer)) {
        known.set(name, hash);
      }
    }
  }
  const apiKey = options.mode === "api" ? readApiKey(options.keyStdin) : "";
  const variant = definition.variant?.(options.flags) ?? null;
  const fixedPurposes = definition.fixedPurposes?.(options.flags) ?? [];
  mkdirSync(dir, { recursive: true });
  let spent = 0;
  let saved = 0;
  let failed = 0;
  // The first reason to stop stays, so that a worker that finishes later
  // does not clear the stop of another worker, such as a changed prompt.
  let stopped: string | null = null;
  const limitReached = () =>
    options.mode === "api" && spent >= options.maxCost
      ? `The run cost $${spent.toFixed(4)} and reached the limit of $${options.maxCost.toFixed(2)}, so it sent no more requests.`
      : null;
  const queue = [...jobs];
  async function worker(): Promise<void> {
    for (let job = queue.shift(); job && !stopped; job = queue.shift()) {
      const name = `${job.evalCase.id}.r${job.rep}`;
      const recorded = replay?.get(name);
      const model: EvalModel<string> =
        options.mode === "api"
          ? {
              kind: "anthropic",
              models: options.models,
              apiKey,
              ...definition.provider,
              ...(recorded ? { replay: recorded } : {}),
            }
          : {
              kind: "scripted",
              answers: definition.answers({
                evalCase: job.evalCase,
                mode: options.mode,
                flags: options.flags,
              }),
            };
      const { ai, calls, settle } = createEvalAIService(model);
      const started = Date.now();
      let result: unknown;
      try {
        result = await definition.run({
          evalCase: job.evalCase,
          rep: job.rep,
          ai,
          flags: options.flags,
        });
        // The provider can send a request to a fallback model. That answer
        // does not measure the model of the run.
        const other = calls.find(
          (call) =>
            call.model !== "replay" &&
            !call.model.startsWith(call.requestedModel),
        );
        if (other) {
          throw new Error(
            `The ${other.purpose} call was served by ${other.model}`,
          );
        }
      } catch (error) {
        // The calls before the failure cost money, so the cost limit counts
        // them.
        await settle();
        spent += costOf(calls);
        failed += 1;
        stopped ??= limitReached();
        const message = error instanceof Error ? error.message : String(error);
        // An error is not a model result. It stays out of the answers, and
        // the next run sends the case again.
        appendFileSync(
          join(dir, "errors.jsonl"),
          `${JSON.stringify({ caseId: job.evalCase.id, rep: job.rep, at: new Date().toISOString(), message })}\n`,
        );
        console.log(`${name}: error: ${message}`);
        continue;
      }
      const answer: EvalAnswer<unknown> = {
        caseId: job.evalCase.id,
        rep: job.rep,
        model: label,
        promptVersions: definition.promptVersions,
        variant,
        fixedPurposes,
        ms: Date.now() - started,
        cost: costOf(calls),
        calls,
        result,
      };
      spent += answer.cost;
      const changed = changedRequest(known, answer);
      if (changed) {
        stopped = `The request "${changed}" differs from an earlier answer of ${prompts}. A prompt changed, but its version did not. Change the version, and run again.`;
        return;
      }
      for (const [hashName, hash] of hashesOf(answer)) {
        known.set(hashName, hash);
      }
      writeFileSync(
        join(dir, `${name}.json`),
        `${JSON.stringify(answer, null, 2)}\n`,
      );
      saved += 1;
      console.log(
        `${name}: ${(answer.ms / 1000).toFixed(1)} s, $${answer.cost.toFixed(4)}`,
      );
      // The estimate before the run can be too low, so the real cost has the
      // last word.
      stopped ??= limitReached();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(options.concurrency, jobs.length) }, worker),
  );
  const scores = join(dataDir, "scores");
  mkdirSync(scores, { recursive: true });
  const runLog = join(scores, "run-log.md");
  if (!existsSync(runLog)) {
    writeFileSync(
      runLog,
      "| Time (UTC) | Prompts | Model | Answers | Cost |\n| --- | --- | --- | --- | --- |\n",
    );
  }
  appendFileSync(
    runLog,
    `| ${new Date().toISOString().slice(0, 16).replace("T", " ")} | ${prompts} | ${label} | ${saved} of ${jobs.length} | $${spent.toFixed(4)} |\n`,
  );
  if (stopped) {
    throw new Error(stopped);
  }
  console.log(
    `Done: ${saved} answers, ${failed} errors, $${spent.toFixed(4)}.`,
  );
}

function scoreCommand(definition: AnyEval): void {
  const dataDir = checkDataDir(definition);
  const cases = new Map(
    definition.loadCases("all").map((evalCase) => [evalCase.id, evalCase]),
  );
  const scored: {
    prompts: string;
    model: string;
    answer: EvalAnswer<unknown>;
    score: unknown;
  }[] = [];
  const skipped = new Set<string>();
  for (const { prompts, model, answer } of readAnswers(dataDir)) {
    const evalCase = cases.get(answer.caseId);
    if (!evalCase) {
      skipped.add(answer.caseId);
      continue;
    }
    scored.push({
      prompts,
      model,
      answer,
      score: definition.score({ evalCase, answer }),
    });
  }
  const groups = new Map<string, unknown[]>();
  for (const { prompts, model, score } of scored) {
    const group = `${prompts}\t${model}\t${definition.results.group?.(score) ?? ""}`;
    groups.set(group, [...(groups.get(group) ?? []), score]);
  }
  const rows = [...groups.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([group, scores]) => {
      const [prompts = "", model = "", name = ""] = group.split("\t");
      return definition.results.row({ prompts, model, group: name, scores });
    });
  const dir = join(dataDir, "scores");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "RESULTS.md"),
    [
      `# Results of the ${definition.name} eval`,
      "",
      "Written by the `score` command of the eval.",
      "",
      ...definition.results.head,
      ...rows,
      "",
    ].join("\n"),
  );
  const report = definition.results.report;
  if (report) {
    for (const prompts of new Set(scored.map((item) => item.prompts))) {
      writeFileSync(
        join(dir, `report-${prompts}.md`),
        [
          `# Report of prompts ${prompts}`,
          "",
          ...report(
            scored
              .filter((item) => item.prompts === prompts)
              .map((item) => item.score),
          ),
          "",
        ].join("\n"),
      );
    }
  }
  console.log([...definition.results.head, ...rows].join("\n"));
  if (skipped.size > 0) {
    console.log(
      `Not scored: ${[...skipped].join(", ")}. Their case is not in the cases.`,
    );
  }
  const seen = new Map<string, Map<string, string>>();
  const problems = new Set<string>();
  for (const { prompts, answer } of scored) {
    const known = seen.get(prompts) ?? new Map<string, string>();
    const changed = changedRequest(known, answer);
    if (changed) {
      problems.add(
        `${prompts}: the request "${changed}" differs between answers`,
      );
    }
    for (const [name, hash] of hashesOf(answer)) {
      known.set(name, hash);
    }
    seen.set(prompts, known);
  }
  if (problems.size > 0) {
    throw new Error(
      `A prompt changed without a new version:\n${[...problems].join("\n")}`,
    );
  }
  console.log(`Wrote ${join(dir, "RESULTS.md")}.`);
}

/**
 * Runs the command of an eval script: `check`, `run`, or `score`, with its
 * options. A failure prints its message and sets the exit code, with no
 * stack.
 */
export async function runEvalCommand<
  Role extends string,
  Case extends { id: string },
  Result,
  Score,
>(
  definition: EvalDefinition<Role, Case, Result, Score>,
  args: string[] = process.argv.slice(2),
): Promise<void> {
  const anyEval = definition as unknown as AnyEval;
  const [command, ...rest] = args;
  try {
    if (command === "run") {
      await runCommand(anyEval, parseOptions(anyEval, rest));
    } else if (command === "score") {
      scoreCommand(anyEval);
    } else if (command === "check") {
      checkCommand(anyEval);
    } else {
      console.log(
        `Commands of the ${definition.name} eval: check, run, score. docs/agents/evals.md has the options.`,
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
