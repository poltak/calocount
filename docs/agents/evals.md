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
the repository, and give its path to the eval through the configuration, as
`core/live/config.ts` reads it. Send private data only with an API key of an
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
