# The template

This repository is a template. A new project starts from its latest commit and
keeps its Git history, so that the project can take later template changes
with cherry-picks.

The template is a runnable application: auth, the notes example feature, and
their tests. A passing `pnpm run check` is therefore the evidence that a
dependency update is safe.

The repository is private and only for use in the company, so it has no
license file. Add a license before the repository becomes public or goes to a
person outside the company.

## Start a project

Use the `start-project` skill. It has the full steps. In short:

1. Make a new, empty repository for the project.
2. Clone the template.
3. In the clone, run the `start-project` workflow with the project's name, the
   product name, the URL of the new repository, and the account mode.
4. Create `.env`, and push.
5. Set the maintainers and the label for the "Template-owned files" check,
   as [setup](setup.md#files-that-come-from-the-template) describes.

[`scripts/start-project.mjs`](../../scripts/start-project.mjs) makes each
change. It renames the remote `origin` to `template`, adds the new repository
as `origin`, sets the three names and the account mode, and removes the files
that only the template needs. It records the template commit that the project
started from, in `template-version.json`. The workflow runs the script, then
each check, and then makes one commit.

A new project keeps the notes example, because it is the model for a feature.
Use the `remove-example` skill to remove it later.

Do not use GitHub's "Use this template" button. It makes a repository without
the template's history, so no later sync is possible. Do not use a GitHub
fork. An organization can have only one fork of a repository, and a fork's pull
requests go to the template by default.

## Take a later template change

Use the `sync-template` skill, in the project. It runs the `sync-template`
workflow, which cherry-picks each new template commit, runs each check, and
records the new template version in `template-version.json`.
[`scripts/sync-template.mjs`](../../scripts/sync-template.mjs) has the
rules, and its header describes each command.

A sync reads the `main` branch of the template, and uses cherry-picks only.
The [decisions](decisions.md#tooling) give the reason.

## The two workflows

An agent that followed a skill made these changes before, and no two runs
were the same. Now each step and each rule is in a script, and a
[Swamp](https://github.com/swamp-club/swamp) workflow in `workflows/` gives
the order of the script's commands. A run uses no language model.

- The logic is in the two scripts, not in Swamp models. Each Swamp command
  needs an account at swamp-club.com, so CI cannot run a workflow without a
  secret, and a person without an account cannot run one. The scripts run
  with Node alone, and their tests in `scripts/` are part of
  `pnpm run check`.
- Without Swamp, a person or an agent runs the commands of a script in the
  order that its skill gives. The result is the same.
- What Swamp adds is one command for the full flow, a record of each run, and
  a retry that starts at the step that failed.
- Two parts need judgment, and no script does them. One is a conflict that no
  rule of `sync-template.mjs` resolves, and the workflow stops there. The
  other is the removal of the notes example, because what replaces the
  example depends on the project's own code.

[Setup](setup.md#swamp) has the commands that install Swamp and run a
workflow. `.swamp.yaml` makes this repository a Swamp repository, so a new
clone can run a workflow at once. The file has an ID of the repository, and
`start-project.mjs` gives each project a new one.

`scripts/workflows.test.mjs` checks that each command in a workflow file
names a script that exists. It does not run Swamp. After a change to a
workflow file, run `swamp workflow validate`.

## Change the template

- Put each change in its own commit, so that a project can cherry-pick it.
- A project reports a gap as an issue of this repository, as the
  `sync-template` skill says. A gap has one of four results:
  - A seam goes in the template when it adds no file, no dependency, and no
    text that each task loads to a project that does not use it, and a test
    covers it.
  - A rule or a feature goes in the template when it helps most projects, and
    its value is more than its cost.
  - A capability for some projects goes in the template as an optional part,
    with a clear way to turn it on.
  - A need of one project stays in that project. Close the issue, with the
    reason.
- A new mechanism in `scripts/` needs two stops in real projects, or one stop
  that is a safety failure. Each script is more to read and to keep correct in
  each project.
- Keep the application runnable and its checks passing. The checks are what
  make automatic dependency updates safe.
- When you add a file that only the template needs, add it to `templateOnly`
  in [`scripts/template-paths.json`](../../scripts/template-paths.json), in
  the same commit. Add a new migration of the notes example to `withExample`
  there. Without the entry, a project gets a file in its next sync that it
  must not have. Do not
  remove an entry, because a project that is behind still needs it.
  [`scripts/template-files.mjs`](../../scripts/template-files.mjs) describes
  the lists.
- `start-project.mjs` finds each place that it changes by the text of the
  file. When a commit changes one of those files, the "Start project" workflow
  of CI makes a project from the commit and runs each check on the project.
  When that workflow fails, correct the edit in the script.
- Do not add email, background jobs, file upload, or a component library. Each
  project needs different ones, and each adds dependencies that must stay
  current.

## Dependency updates

Renovate opens pull requests for dependency updates, and CI runs
`pnpm run check`, the browser tests, and the live start check on each one.
Small weekly updates replace one large update each year. The rules are in
[`renovate.json`](../../renovate.json):

- Minor and patch updates go into one pull request each week, named "Update
  minor and patch versions". It merges by itself when CI passes. Renovate does
  the merge, not GitHub.
- They are one pull request because Renovate merges one branch at a time, and
  rebases each other branch after a merge. With a pull request for each
  update, ten updates need ten merges one after the other, and a new CI run
  on each branch that is left after each merge.
- A major update, and each update of a dependency with a 0.x version, waits
  for a person. A minor version of a 0.x dependency can break its API. These
  are `kysely`, `@hono/zod-validator`, and `@electric-sql/pglite` now.
- `oxlint`, `better-auth`, `typescript`, and `@beads/bd` always wait for a
  person. The `lint/` rules use oxlint's JS plugin support, which oxlint marks
  as alpha. A Better Auth update can change its schema, so compare
  `AuthTables` in `backend/src/features/auth/storage/types.ts` with the new
  schema. A `bd` update can change the issue database, and an older `bd` then
  refuses it, so each person runs `pnpm install` after the sync.
- An update is at least 3 days old before Renovate proposes it.
- pnpm applies the same 3 days to each package, direct or indirect, with
  `minimumReleaseAge` in `pnpm-workspace.yaml`. Its value is in minutes. Keep
  it equal to the value in `renovate.json`. pnpm does not put a version that
  is less than 3 days old into the lockfile, and an install fails when the
  lockfile has one.
- The weekly lock file update merges by itself when CI passes. It has no
  release notes for a person to read, and the pnpm rule keeps a new release
  out of it. Renovate cannot apply its 3 day rule to the indirect dependencies
  that pnpm changes there, so the config turns the rule off for that pull
  request. With the rule on, the pull request has a `renovate/stability-days`
  status that stays pending without end.
- Renovate starts new updates on Monday, from 00:00 to 12:00 UTC. The free
  hosted plan runs a repository every 4 hours. The usual weekly window is 4
  hours, so one late run could miss it and delay the updates for a week.
- Renovate's limit of 2 new pull requests each hour is off. With only a few
  runs in the weekly window, the limit left most updates for a later week.

Facts to check on the first update of each kind:

- A Node update must change `.nvmrc`, `engines`, and `devEngines.runtime` in
  one pull request. `scripts/check-node-version.mjs` fails the check when they
  differ.
- A pnpm update must change `packageManager`, `devEngines.packageManager`, and
  the `version` input of `pnpm/action-setup` in each CI workflow.
  `scripts/check-pnpm-version.mjs` fails the check when one of them differs
  from `packageManager`.
- `hono` is in two workspaces. Both must stay at the same version.

### What a person does

Renovate assigns a pull request to the person in `assignees` in
`renovate.json` when it needs a person, and GitHub sends that person a
notification. A pull request that merges by itself has no assignee, unless its
CI fails.

For each assigned pull request:

1. Read the release notes in its description.
2. If CI is green, merge it.
3. If CI is red, fix the code on the branch of the pull request, or close the
   pull request. Renovate then ignores that version. The dashboard has a
   checkbox that opens it again.

When the weekly pull request has a red CI, one update in it holds back the
others. Find the package in the CI log, and add a rule for it at the end of
`packageRules`: `{ "matchPackageNames": ["<name>"], "groupName": null }`.
That update then gets a pull request of its own, and the others merge.

To take a version before it is 3 days old, for example an urgent security
fix, add it to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` with its
version, such as `- hono@4.13.14`. Remove the entry when the version is 3 days
old.

The "Dependency Dashboard" issue lists each update and its state.

### One-time setup of Renovate

A person with admin rights on the template repository installs the Mend
Renovate GitHub App. Select "Only select repositories" and then the template
repository. The hosted Community Cloud is free for private repositories. Do
not install it on all repositories. The app then starts in silent mode and
opens no pull requests.

The app opens no onboarding pull request, because the repository already has
`renovate.json`. Its first run opens an issue named "Dependency Dashboard",
which lists every update that Renovate found. The log of each run is at
<https://developer.mend.io>.

No repository setting is necessary. Renovate merges its own pull requests at
one of its runs, after it sees that each check is green. `renovate.json` turns
off GitHub's auto-merge with `platformAutomerge`, for two reasons:

- For a private repository, GitHub has "Allow auto-merge" and required status
  checks only on a paid plan. This organization is on the free plan.
- GitHub's auto-merge is safe only with a required status check. Without one,
  GitHub can merge a pull request before CI finishes.

The cost is time. Renovate merges only a branch that is up to date with
`main`. After each merge it rebases the next pull request, CI runs again, and
the merge comes at a later run. A week with many updates can take a day or
more. A project on a paid plan can set `platformAutomerge` to `true`, after it
makes the CI check a required status check on `main`.

Keep Dependabot alerts on. They are free and do not conflict with Renovate.
Renovate, not Dependabot, updates the versions: Dependabot does not update
`.nvmrc` or `devEngines`, and it has no lockfile maintenance.

A project decides for itself if it runs Renovate. A project that does not
takes the template's dependency updates with the `sync-template` workflow.

## Open work

- **One origin in production.** The backend cannot serve the frontend build
  yet, and the page has no content security policy. Both wait for a decision
  on the hosting.
- See also [the open work list](todos/initial-setup.md).
