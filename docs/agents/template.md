# The template

This repository is a template. A new project starts from its latest commit and
keeps its Git history, so that the project can take later template changes
with a merge or a cherry-pick.

The template is a runnable application: auth, the notes example feature, and
their tests. A passing `pnpm run check` is therefore the evidence that a
dependency update is safe.

The repository is private and only for use in the company, so it has no
license file. Add a license before the repository becomes public or goes to a
person outside the company.

## Start a project

Use the `start-project` skill. It has the full steps. In short:

1. Make a new, empty repository for the project.
2. Clone the template. Rename its remote from `origin` to `template`, add the
   new repository as `origin`, and push.
3. Replace the three names, select the account mode, and remove the example
   feature if the project does not need it.
4. Record the template commit that the project started from, in
   `docs/agents/template-version.md`.

Do not use GitHub's "Use this template" button. It makes a repository without
the template's history, so no merge is possible later. Do not use a GitHub
fork. An organization can have only one fork of a repository, and a fork's pull
requests go to the template by default.

## Take a later template change

Use the `sync-template` skill. `git fetch template` shows what changed. Merge
`template/main` while the project has changed few of the template's files.
After that, cherry-pick single commits.

## Change the template

- Put each change in its own commit, so that a project can cherry-pick it.
- Make a change here, in the template, when every project needs it. Make it in
  the project when only that project needs it.
- Keep the application runnable and its checks passing. The checks are what
  make automatic dependency updates safe.
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
- `oxlint`, `better-auth`, and `typescript` always wait for a person. The
  `lint/` rules use oxlint's JS plugin support, which oxlint marks as alpha. A
  Better Auth update can change its schema, so compare `AuthTables` in
  `backend/src/features/auth/storage/types.ts` with the new schema.
- An update is at least 3 days old before Renovate proposes it.
- The weekly lock file update waits for a person. Renovate cannot apply the 3
  day rule to the indirect dependencies that it changes, so the config turns
  the rule off for that pull request. With the rule on, the pull request has
  a `renovate/stability-days` status that stays pending without end.
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
  the `version` input of `pnpm/action-setup` in the CI workflow.
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

A project decides for itself if it runs Renovate. A project that does not can
take the template's dependency updates with the `sync-template` skill.

## Open work

- **One origin in production.** The backend cannot serve the frontend build
  yet, and the page has no content security policy. Both wait for a decision
  on the hosting.
- See also [the open work list](todos/initial-setup.md).
