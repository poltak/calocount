# Agent instructions

These instructions apply to the whole repository. Use this file for rules that
Codex and Claude Code must follow on every task. Use `docs/agents/` for longer
project information. Read the documents that apply to the task.

## Repository

- This is a pnpm workspace with `backend`, `frontend`, and `common` packages.
- Put code used by both apps in `common`. Code imported by `frontend` must work in a browser. Keep server-only code in `backend`.
- `backend` code never imports from `frontend`, and vice-versa. Though this has a narrow exception: frontend code may use `import type` from `backend/api`.
- Only test files may load `backend/testing`. They run on Node, and a project
  can add a second host for the same tests, as
  [testing](docs/agents/testing.md#a-second-test-host) says.
- Use the Node version in `.nvmrc` and the pnpm version in `package.json`.
  pnpm runs scripts on the Node version pinned in `devEngines.runtime`, so run
  Node through pnpm (`pnpm run …`, `pnpm exec node …`), not bare `node`. The
  `node` on your PATH may be a different version.
- In a project made from the template, do not change a file that
  `templateOwned` in `scripts/template-paths.json` lists. Describe the change
  to the person instead. It goes to the template first, and the project gets
  it with a sync.

## Start of a task

- Before the first task in a checkout, run `pnpm install`. When `pnpm` is
  missing, install it with the command in
  [setup](docs/agents/setup.md#requirements), then run `pnpm install`.
- Before you make a branch, run `git fetch origin`, and start the branch from
  `origin/main`: `git switch -c <name> origin/main`. A branch from an old
  `main` does not have the fixes that `main` got after it.
- When a session starts, a hook tells you if the branch is behind `main` on
  its remote. Do what it says.

## Coding standards

- Avoid barrel exports. Do not add `index` files that re-export many modules.
  Import from defining modules. Use explicit exports from a `types.ts` when a
  feature needs to expose a public API.
- Avoid depth in function call stacks as much as possible. Unnecessary depth makes for
  very hard-to-grok code.
- Keep each file under 5,000 tokens (20,000 bytes). The pre-commit hook stops
  a commit that adds a larger file or makes one grow, and its message says how
  to split the file. Plan the split before a change makes a file too large.
- Do not write unit tests for modules. Full app integration tests should be written which fit our standards.
  Read [docs/agents/testing.md](docs/agents/testing.md) for more context.
- When you finish a change to a page or a workflow that has no black box
  tests, ask the person if the workflow is stable. If it is, write the tests
  with the `write-black-box-test` skill. If it is not, file a beads issue to
  write them, so that a later session sees it. Do not ask again while that
  issue is open.
- Do not add any new dependencies without explicit user authorization.
- Do not change the data model without the person's approval. A change to the
  data model is a new or changed migration, which implies a new or changed
  table, column, or rule between tables. When a task needs one, stop before you
  write code. Tell the person the change, the reason, the tradeoffs (if any),
  and wait for their answer.
- Write a comment only for what the code cannot say: the reason for a choice,
  a constraint that other code relies on, or what breaks when the code changes.
  Do not write a comment that the name, the types, or the next line already
  say. This applies to JSDoc also.
  - Keep: `// Without this listener, a failed connection stops the process.`
  - Do not write: `/** Create the account. */` on `createAccount()`.
  - When a comment only says what the code does, delete it, or give the code a
    better name.

## Writing

- Always talk and write in ASD-STE100 Simplified Technical English.
- Apply the `unslop` skill to all prose you write: documentation, code comments,
  commit messages, pull request descriptions, and replies to the user.
- Do not give the person an uncertainty that you can clear up yourself with a
  little more time. First look for the answer: read the code and the documents,
  run a command, read the help of a tool, or search the web. Ask the person
  only for a decision that is theirs, or for a fact that only they know. When
  you cannot find the answer, say what you checked. A clear and certain reply
  is more important than a fast one.
  - Do not write: "I must check if Codex supports this hook." Check the
    documentation of Codex, and give the result.

## Checks

- While you work, run `pnpm run typecheck` and `pnpm run lint` after
  TypeScript changes. Also run the app tests of each feature that you change,
  such as `pnpm run test:feature src/features/<feature>`. This builds
  `backend` and `common` first, because the tests load their build. It takes
  seconds.
  `pnpm run check` takes minutes, because it runs each app test.
- Run `pnpm run check` before you push, and before you tell the person that
  the work is done. Each push to a pull request that is ready for review
  starts CI and the agent review, so a failure that CI finds costs a second
  review.
- Run `pnpm run build` after changes to compiled code or package exports.
- Run `pnpm run test:browser` after changes to routing, `main.tsx`, the Vite
  config, an error boundary, or a page that has a page object. `pnpm run check`
  does not run it.
- Check `git status` before and after edits. Preserve changes unrelated to the task.
- Open a pull request only when the person asks for one. Open it as a draft
  unless the person says not to. Push to `main` only when the person asks for
  that push. Otherwise push work to separate `feature/*` branches.
- Make the user aware that the PR is in draft mode and won't be made ready and run CI
  checks until the user explicitly demands it.
- Before you open a pull request, merge `origin/main` into the branch, and run
  the checks again.
- Do not open a pull request when a check that this file requires did not
  run. Make it run, or tell the person why it cannot.
- When the "Agent review" check of a pull request fails, tell the person about
  each finding. Change the text only where a finding is correct. Do not run
  the review again to get a different result.
- After a fix for an agent review finding is pushed, reply with the commit
  and the checks that passed. The review verifies the fix and records its
  status. Acceptance checkboxes are only for configured maintainers to
  approve findings whose rules permit approval. Agents must not check them
  to report a fix. Resolve the line conversation after the review verifies
  the fix or records maintainer approval.

## Issue tracking

Each project keeps its issues and its open work in beads, a command-line
issue tracker. [Beads](docs/agents/beads.md) describes it.

- Run it as `pnpm exec bd`. `package.json` pins its version, so all persons
  and agents use the same one. When `bd` says "no beads database found", do
  the steps of
  [Join a project that uses beads](docs/agents/beads.md#join-a-project-that-uses-beads).
  Do not run `bd init` for this. Run it only to turn on beads in a new
  project.
- This section replaces the agent instructions of beads. Do not run
  `bd prime`, `bd setup`, `bd hooks`, or `bd remember`.
- Run `pnpm exec bd dolt pull` before your first `bd` command in a session.
  Run `pnpm exec bd dolt push` after you create, change, or close an issue.
  These two commands change only the issues, so they need no request from the
  person. When a push fails because the remote has new changes, pull, and then
  push again.
- Never run `bd dolt push --force`. It replaces the issues on the remote, and
  the other persons lose their changes.
- When the project copies its issues to GitHub Issues, beads keeps the
  original. Update GitHub only with `pnpm exec bd github sync --push-only`.
  Then run `pnpm exec bd dolt push`, because the sync writes the GitHub link
  into each new issue. Do not run `bd github sync` without `--push-only`, and
  do not run `bd github pull`. A pull writes the GitHub data over the issues
  in beads, and it replaces their assignees. Give the token in
  `GITHUB_TOKEN`, for example with `export GITHUB_TOKEN=$(gh auth token)`. Do
  not set `github.token` with `bd config set`. That command writes the token
  into `.beads/config.yaml`, and git tracks that file.
- Do not put secrets or private data in an issue. The secret check and the
  agent review do not see issues.
- When you find a problem outside your task, file an issue, and then continue
  with your task. Do not fix the problem in the current branch unless the
  person asks. Give the issue a title and a description that an agent in a new
  session can act on. Tell the person the ID of the issue.

  ```sh
  pnpm exec bd create --title="..." --description="..." --type=bug|task|feature --priority=2
  ```

  The priority is 0 (critical) to 4 (backlog).

- For work that needs more than one session or more than one pull request,
  make an epic with one child issue for each step. Do not write a plan file.
  Give each step a description that an agent in a new session can act on.

  ```sh
  pnpm exec bd create --type=epic --title="..." --description="..."
  pnpm exec bd create --parent=<epic ID> --type=task --title="..." --description="..."
  pnpm exec bd dep add <step> <step that must come first>
  ```

- At the start of work, `pnpm exec bd ready` lists the open issues that
  nothing blocks, and `pnpm exec bd show <ID>` shows one issue. Claim the
  issue that you start with `pnpm exec bd update <ID> --claim`, so that no
  other agent takes it.
- Put a design choice for one step in its issue, with `--design="..."`. A fact
  or a decision that the code depends on goes in `docs/agents/`.
- When your work completes an issue, close it:
  `pnpm exec bd close <ID> --reason="..."`.
- A task that one session finishes needs no issue. The task list of your agent
  tool is enough, and it writes no file.

## Project documentation

- Before changing, adding, moving, or deleting code in any workspace, read [docs/agents/code-architecture.md](docs/agents/code-architecture.md) and follow its rules.
- Before writing or changing a test, read [docs/agents/testing.md](docs/agents/testing.md) and follow its rules.
- Use [docs/agents/README.md](docs/agents/README.md) to find project reference documents.
- Add stable project facts and decisions under `docs/agents/`. Update the relevant document when those facts change.
- A document in `docs/agents/` says how the system works and why. Steps to do, phases, checklists, and the status of work go in beads.
- Use a `SKILL.md` only for a repeatable task workflow. Keep general project rules and reference documents out of skills.
- When each step of a workflow needs no judgment, put the steps in a script in `scripts/`, with tests, and add a Swamp workflow in `workflows/` that runs it. Its skill then names the workflow, and has only the steps that need judgment. The `sync-template` skill is the model, and [setup](docs/agents/setup.md#swamp) describes Swamp.
- Put new repository skills in `.agents/skills/<name>/`. For each skill, add a Git-tracked symlink at `.claude/skills/<name>` that points to `../../.agents/skills/<name>`, so Codex and Claude Code use the same files.
