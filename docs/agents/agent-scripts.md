# Scripts of agent tasks

A task step that needs no judgment is a script in `scripts/`, with tests. A
Swamp workflow in `workflows/` runs the script, and the skill or the document
of the task keeps only the steps that need judgment. Before, an agent did these
steps from the text of a skill or a document, and an agent could skip or
change a step with no notice. [Setup](setup.md#swamp) tells how to install and
run Swamp.

## The workflows

| Workflow           | Runs                                                       | Run it in            |
| ------------------ | ---------------------------------------------------------- | -------------------- |
| `start-project`    | `scripts/start-project.mjs`, step by step                  | The template only    |
| `sync-template`    | `pnpm run template:sync`, step by step                     | A project            |
| `pr-ready`         | `pnpm run pr:ready`, step by step                          | A branch before a PR |
| `issues-join`      | `pnpm run issues:join`                                     | The main checkout    |
| `black-box-mutate` | `pnpm run test:browser:mutate`, with `--input spec=<path>` | Any checkout         |
| `ui-screens`       | `pnpm run ui:screens`                                      | Any checkout         |
| `check-shadcn`     | `pnpm run check:shadcn`                                    | Any checkout         |

Each script has a comment at its start that tells what it does. A person or
an agent without Swamp runs the same commands, and the result is the same.

## The choices

- **`pr:ready` runs the browser tests for more files than `AGENTS.md`
  names.** Its rules are file paths, in `browserRules` of
  `scripts/pr-ready.mjs`. They also match each file of a feature that has
  black box tests, and each CSS file. A run of the browser tests that is not
  necessary costs minutes. A missed run costs a failed CI run and a second
  agent review.
- **`pr:ready` keeps its results for one commit.** The results are in the Git
  directory, not in the working tree. A new commit makes `report` fail until
  the checks run again, so a pull request cannot show the results of an older
  commit.
- **`test:browser:mutate` does not parse TypeScript.** TypeScript 7 has no
  JavaScript API, and a parser would be a new dependency. The script finds the
  checks in the text, with comments and strings masked. It gives each check
  with an expected value a custom matcher on the same line, so Playwright
  reports each failed check at the line of the check. A check with no
  expected value, such as `toBeVisible()`, a check with `.not`, and an
  `expect.poll` check stay with the agent.
- **The eval harness has a `verify` command, and no Swamp workflow.**
  `verify` reads `results.share` of each score. Before, an agent read the
  results table and judged whether it showed 100% and 0%. A workflow would
  need the name of the eval in its command, and `verify` is one command.
- **The scaffold of a new feature stays with the agent.** Lint already names
  each composition file that a new feature is missing from. A scaffold that
  passes lint and the coverage check would be a full example feature, which
  the agent then rewrites.
