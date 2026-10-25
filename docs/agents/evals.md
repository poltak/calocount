# Evals

An eval measures a prompt of the project. It runs the real Logic on a set of
cases, sends the requests to a real model, and scores each answer against a
key that a person checked. An eval is not a test. It costs money, its score is
a measurement and not a pass or a fail, and CI does not run it.

Use an eval to choose a model, and to see the effect of a change to a prompt.

## The parts

- `backend/src/features/ai/services/`: the model service.
  `AIServiceInterface<Role>` is the interface, `AnthropicAIService` calls the
  Anthropic Messages API, and `FakeAIService` gives a fixed answer for each
  purpose. `Role` names the work of a request, such as `"extraction"`. Each
  project gives its own roles, and the deployment chooses a model for each one.
- `backend/src/features/core/evals/`: `types.ts` has `EvalDefinition`, the
  interface that a project gives the harness. `index.ts` is the composition
  root of the evals. `RecordingAIService` keeps each call with its tokens and
  hashes, and `ReplayAIService` gives recorded outputs.
- `backend/src/features/core/scripts/eval-command.ts`: `runEvalCommand`, the
  command line of each eval.

## Add an eval

1. In `core/evals/index.ts`, add a function that constructs the Logic of the
   eval. Give it the `ai` of the run, and a Storage with the data of one case
   in memory in place of the database. Only a composition root constructs
   Logic, so this function cannot go in the feature.
2. Write the eval in `backend/src/features/<feature>/scripts/<name>-eval.ts`.
   Give an `EvalDefinition` to `runEvalCommand`:
   - `loadCases` and `check` read the cases and their keys. `run` calls the
     function of step 1, and returns the result that the answer file keeps.
   - `answers` gives the answer of each purpose for the modes with no model.
     The oracle answers from the key, and the null mode gives nothing.
   - `score` scores one answer against its key. `results` writes one row of
     the results table for each group of scores.
   - `estimate` gives the cost before a run. `priceOf` gives the price of a
     model.
   - `defaultModels` and `provider` are the models and the settings of
     production, so that the eval measures what production runs.
3. Add the script to the `entry` list of the backend in `knip.jsonc`. Add a
   backend script,
   `"eval:<name>": "pnpm --filter backend... run build && node dist/features/<feature>/scripts/<name>-eval.js"`,
   and a root script that runs it.
4. Run the oracle mode and the null mode. The oracle must score 100%, and the
   null mode must score 0%. Run both again after each change to the eval or to
   a key. They cost nothing.

### An example

This eval is not in the template. It measures a prompt that suggests a title
for a note. `TitleLogic` would call `ai.generate` with the purpose
`noteTitle` and the role `title`. Each case is the body of a note, and its key
is the right title.

In `core/live/config.ts`, read the path of the data folder:

```ts
/** The data folder of the title eval, outside Git. */
export function readTitleEvalDataDir(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.TITLE_EVAL_DATA?.trim() || null;
}
```

In `core/evals/index.ts`, construct the Logic:

```ts
export function createTitleEval({ ai }: { ai: AIServiceInterface<"title"> }) {
  const storage = titleEvalStorage(); // Only the Storage methods that TitleLogic calls.
  return new TitleLogic({
    storage,
    services: { ai },
    transaction: (run) => run(storage),
  });
}
```

In `backend/src/features/notes/scripts/title-eval.ts`, give the definition:

```ts
import { createTitleEval } from "../../core/evals/index.js";
import { priceOf } from "../../core/evals/model-prices.js";
import { readTitleEvalDataDir } from "../../core/live/config.js";
import { runEvalCommand } from "../../core/scripts/eval-command.js";
import { TITLE_PROMPT_VERSION } from "../utils/title-prompt.js";

interface TitleCase {
  id: string;
  body: string;
  key: { title: string };
}

await runEvalCommand<
  "title",
  TitleCase,
  { title: string },
  { right: boolean; cost: number }
>({
  name: "title",
  dataDir: readTitleEvalDataDir() ?? "",
  privateData: true,
  promptVersions: { title: TITLE_PROMPT_VERSION },
  roles: ["title"],
  defaultModels: { title: "claude-haiku-5-5" },
  loadCases: (selection) => readCases(selection),
  check: (evalCase) =>
    evalCase.key.title ? [] : [`${evalCase.id}: the key has no title`],
  estimate: ({ cases, models }) => {
    const price = priceOf(models.title) ?? { input: 0, output: 0 };
    return (cases.length * (2_000 * price.input + 200 * price.output)) / 1e6;
  },
  run: async ({ evalCase, ai }) => ({
    title: await createTitleEval({ ai }).suggestTitle({ body: evalCase.body }),
  }),
  answers: ({ evalCase, mode }) => ({
    noteTitle: () => ({ title: mode === "oracle" ? evalCase.key.title : "" }),
  }),
  score: ({ evalCase, answer }) => ({
    right: answer.result.title === evalCase.key.title,
    cost: answer.cost,
  }),
  results: {
    head: ["| Prompts | Model | Right |", "| --- | --- | --- |"],
    row: ({ prompts, model, scores }) =>
      `| ${prompts} | ${model} | ${scores.filter((s) => s.right).length} of ${scores.length} |`,
  },
});
```

`readCases` reads the cases and their keys from the data folder. The format
of a case and of its key is the choice of the eval. `answers` gives the
output of each purpose, so the oracle and the null mode run the same
`TitleLogic` with no model. Then run it:

```sh
export TITLE_EVAL_DATA="<path of the data folder>"
pnpm run eval:title check
pnpm run eval:title run --mode oracle
pnpm run eval:title run --mode null
pnpm run eval:title run --runs 3 --max-cost 0.5
pnpm run eval:title score
```

## Commands

- `check` reads each case and its key, and lists each problem. A wrong key
  makes each model look wrong, so `run` does not start while a problem stays.
- `run` sends each case and run that has no answer file yet.
- `score` reads all answers again and writes the results. It costs nothing.

The options of `run`:

| Option                   | Meaning                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `--max-cost <dollars>`   | The limit. It is necessary in the `api` mode.                                                                      |
| `--dry`                  | Prints the runs to do and the estimate, and sends nothing.                                                         |
| `--mode <mode>`          | `api` (the default), `oracle`, or `null`.                                                                          |
| `--runs <number>`        | The runs of each case. Two or more runs show how much the answers of one model change.                             |
| `--cases <list>`         | Case IDs or set names, separated by commas. The default is `all`.                                                  |
| `--model <model>`        | The model of the first role.                                                                                       |
| `--<role>-model <model>` | The model of another role, such as `--match-model`.                                                                |
| `--concurrency <number>` | The cases that run at the same time. The default is 2.                                                             |
| `--key-stdin`            | Reads the API key from standard input. Without it, the key comes from the macOS Keychain item `anthropic-api-key`. |
| `--replay-from <folder>` | Gives the recorded outputs of `replay.purposes` from an answers folder, such as `extraction-v6/claude-sonnet-5-5`. |

An eval can add its own flags, such as `--detect`, in `flags`. When `variant`
gives a name for the flags, the answers go to a folder of their own. The
command refuses an option that it does not know, because a misspelled flag
would give a run of another kind with no error.

## Folders

The `dataDir` of the eval holds:

- `answers/<prompt versions>/<models>/<case>.r<run>.json`: one file for each
  run of a case, with each model call, its tokens, its hashes, and its output.
  `errors.jsonl` beside them holds the runs that gave no answer. A run that
  failed is not a result, so the next `run` sends it again.
- `scores/RESULTS.md`: the results table. `scores/report-<prompt versions>.md`
  has the report of `results.report`, and `scores/run-log.md` has each run with
  its cost.

The name of the models folder is the model of the first role, then
`+<role>-<model>` for each role with another model, then `+<variant>`.

## Private data

Set `privateData` when a case holds private data, such as patient data. The
command then refuses a data folder that Git can track. Keep the folder out of
the repository, and read its path in `core/live/config.ts`, as
`readTitleEvalDataDir` does in [the example](#an-example). Send private data only with an API key of an
organization whose agreement with the provider covers that data. Keep the key
in the macOS Keychain, or in a file that only you can read and that Git
ignores, with `--key-stdin < <file>`.

## Prompt versions

Each answers folder is for one set of `promptVersions`. Change a version with
each change to its prompt. A new version then gets a new folder, and its
answers do not mix with the earlier ones.

Each call records two hashes: one of its system prompt, schema, and token
limit, and one of the whole request with the hash of each file. The model is
in neither, so the answers of all models compare. The check compares the first
hash of each call. It compares the second hash only for the purposes of
`fixedPurposes`, because a later request can hold the answer of an earlier
one, and so differs between runs. When a hash differs from an earlier answer
of the same versions, `run` stops and saves nothing, and `score` fails.

## Cost

- `run` sends nothing when the estimate is above `--max-cost`. During the run,
  it stops when the real cost reaches the limit.
- The calls of a failed run count. When one of two calls at once fails, the
  command waits for the other one, and counts its cost too.
- An answer that the provider rejects, such as an answer that reaches the token
  limit, comes with no token counts, so its cost is not in the real cost. Each
  such answer can add the cost of its maximum output to the run.
- Each model of a run needs a price in `core/evals/model-prices.ts`, because
  the limit depends on it.
- A provider can answer with a fallback model. Such an answer does not measure
  the model of the run, so the run of that case fails.
