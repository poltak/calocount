# Beads issue tracker

[Beads](https://github.com/gastownhall/beads) is an issue tracker for coding
agents, with a command-line tool, `bd`. Each project uses it. The rules for
agents are in `AGENTS.md`, under "Issue tracking". Run the tool as
`pnpm exec bd`. This section writes `bd` for short.

How the issues sync:

- The issues are in a Dolt database in `.beads/embeddeddolt/`, which Git
  ignores. Dolt is a SQL database with version control. `bd` makes a Dolt
  commit after each change.
- `bd dolt push` sends the new commits to `origin` on GitHub, under the ref
  `refs/dolt/data`. `bd dolt pull` gets the commits of the other persons and
  merges them. The merge is per field. When one person closes an issue and
  another changes its priority, both changes stay.
- Nothing syncs by itself. A push fails when the remote has commits that you
  did not pull. Pull, and then push again.
- `git clone` and `git fetch` do not get `refs/dolt/data`, and GitHub shows
  no issues. Dolt also pushes a branch, `__dolt_remote_info__`, with one file
  that names the ref. No workflow runs for that branch.
- Pull requests do not show the issues, so the pre-commit secret check and the
  agent review do not see them.
- Anyone who can push to the repository can push issues. Branch protection
  does not cover `refs/dolt/data`, and `bd dolt push --force` replaces it.
- All worktrees of a clone use the database in the main checkout. One `bd`
  process at a time writes to it, and the others wait. `bd doctor` does not
  work with this kind of database.

## The bd version

`@beads/bd` in the root `package.json` pins the version of `bd`, so
`pnpm install` gives each person and agent the same one. An older
`bd` refuses a database that a newer one changed, so the version must be the
same for all.

- The `allowBuilds` entry in `pnpm-workspace.yaml` lets the install script of
  the package run. The script downloads the `bd` binary of that version from
  the GitHub release of beads, about 50 MB, and it does not check a checksum.
  Each `pnpm install` without a cache downloads it, also in CI.
- Renovate updates `@beads/bd` in the template, and the update waits for a
  person, because a new `bd` can change the database. A project gets the
  update with a sync. After that, each person runs `pnpm install`.
- When another `bd`, such as one from Homebrew, is on the `PATH`, each command
  warns about two binaries. Remove the other one.

## Join a project that uses beads

Do this one time on each machine, in the main checkout, on a branch that has
`.beads/`. `git worktree list` shows the main checkout first. An agent can do
these steps.

```sh
pnpm install
pnpm exec bd metrics off
pnpm exec bd bootstrap
chmod 700 .beads
git config beads.role maintainer
pnpm exec bd list
```

- The usage metrics of `bd` are on by default. They send the name of each
  command, the `bd` version, and the operating system. The setting is for
  your user, in all projects.
- `bd bootstrap` copies the issues from `refs/dolt/data`. It uses the SSH URL
  in `.beads/config.yaml`, so your SSH key for GitHub must work.
- Without the `chmod` and the `git config`, each `bd` command shows a warning.
- The template has no issues of its own, so in a clone of the template,
  `bd bootstrap` finds nothing. Work on the template in a worktree of a
  project's repository. `bd` there uses the issues of that project.

## Turn on beads in a new project

One person does this one time, after the first push of the project, in its
main checkout:

1. Run `pnpm exec bd init --skip-hooks --skip-agents --prefix <project name>`.
   - `--skip-hooks` keeps the [pre-commit hook](setup.md#the-pre-commit-hook). The
     hooks of beads set `core.hooksPath`, and Git then does not run the secret
     check.
   - `--skip-agents` keeps the instructions of beads out of `AGENTS.md`,
     `.claude/settings.json`, and `.codex/`. Those instructions tell agents to
     file an issue before each change, and to stop the use of memory files.
2. `bd init` makes a Git commit by itself, with its own message. Undo it with
   `git reset --soft HEAD~1`, delete `.beads/README.md`, and commit again. The
   README describes beads in general and has its own instructions for agents.
3. Run `pnpm exec bd dolt push` to make `refs/dolt/data`, and push the commit.

## Stop the use of beads

1. In each project, keep a copy of the issues if you want one:
   `pnpm exec bd export -o <file>`.
2. In the template, remove the "Issue tracking" section and the beads lines
   of `AGENTS.md` and `docs/agents/README.md`, the `plan-in-docs` rule of the
   agent review, this section, and the `@beads/bd` package with its entries in
   `pnpm-workspace.yaml`, `knip.jsonc`, `renovate.json`, and
   `.prettierignore`. Then sync each project.
3. In each project, delete `.beads/` and the beads lines in `.gitignore`, and
   delete the data on GitHub:
   `git push origin --delete refs/dolt/data refs/heads/__dolt_remote_info__`.
4. Each person deletes the database in the main checkout: `rm -rf .beads`.
