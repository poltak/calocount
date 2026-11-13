import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { EvalAnswer } from "../evals/types.js";
import type { AnyEval, Options } from "./eval-command.js";

export async function verifyCommand(input: {
  definition: AnyEval;
  args: string[];
  parseOptions: (definition: AnyEval, args: string[]) => Options<string>;
  checkCommand: (definition: AnyEval) => void;
  runCommand: (definition: AnyEval, options: Options<string>) => Promise<void>;
  modelLabel: (definition: AnyEval, options: Options<string>) => string;
  promptsOf: (definition: AnyEval) => string;
  checkDataDir: (definition: AnyEval) => string;
}): Promise<void> {
  const { definition, args } = input;
  const share = definition.results.share;
  if (!share) {
    throw new Error(
      "Add results.share to the eval definition before running verify.",
    );
  }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--cases") {
      index++;
      continue;
    }
    if (!(definition.flags ?? []).some((flag) => arg === `--${flag}`)) {
      throw new Error(
        `${arg} is not an option of verify. Use --cases or the eval's own flags.`,
      );
    }
  }
  const options = input.parseOptions(definition, [...args, "--mode", "oracle"]);
  input.checkCommand(definition);
  const cases = definition.loadCases(options.cases);
  let failed = false;
  for (const mode of ["oracle", "null"] as const) {
    const modeOptions = { ...options, mode, runs: 1 };
    const folder = join(
      input.checkDataDir(definition),
      "answers",
      input.promptsOf(definition),
      input.modelLabel(definition, modeOptions),
    );
    rmSync(folder, { recursive: true, force: true });
    await input.runCommand(definition, modeOptions);
    const failures: string[] = [];
    for (const evalCase of cases) {
      const file = join(folder, `${evalCase.id}.r1.json`);
      // A run that failed writes to errors.jsonl, and not an answer file.
      if (!existsSync(file)) {
        failures.push(`${evalCase.id}: no answer, see errors.jsonl`);
        continue;
      }
      const answer = JSON.parse(
        readFileSync(file, "utf8"),
      ) as EvalAnswer<unknown>;
      const value = share(definition.score({ evalCase, answer }));
      if (value !== (mode === "oracle" ? 1 : 0)) {
        failures.push(`${evalCase.id}: ${value}`);
      }
    }
    console.log(
      `${mode}: ${cases.length - failures.length} of ${cases.length} cases at ${mode === "oracle" ? 100 : 0}%`,
    );
    failures.slice(0, 20).forEach((failure) => console.log(failure));
    failed ||= failures.length > 0;
  }
  if (failed) {
    throw new Error(
      "Verify failed. The oracle or null scores differ from their expected shares.",
    );
  }
}
