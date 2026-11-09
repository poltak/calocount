# Setup and commands

## Requirements

- pnpm. pnpm downloads and runs the pnpm version in `package.json`, and the
  Node version that the repository pins, so run Node through pnpm
  (`pnpm run …`, `pnpm exec node …`). To install pnpm on macOS or Linux, also
  on a machine with no Node:

  ```sh
  curl -fsSL https://get.pnpm.io/install.sh | sh -
  ```

  The script adds pnpm to the shell profile, so a new shell finds it.
  [pnpm.io/installation](https://pnpm.io/installation) has the other ways.

- Nothing else for development: `pnpm install` brings a PostgreSQL for it.
  Tests need no database server. Production needs a PostgreSQL database.

## Environment

Backend commands read the root `.env`. Values already set in the process
environment take precedence. Copy `.env.example` to `.env` and keep `.env`
private and untracked.

| Variable                    | Required             | Meaning                                                                               |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Yes                  | PostgreSQL connection URL.                                                            |
| `BETTER_AUTH_SECRET`        | Yes                  | Session secret, at least 32 characters. No default exists.                            |
| `BETTER_AUTH_URL`           | Yes                  | The backend's HTTP(S) origin, without a path.                                         |
| `APP_ACCOUNT_MODE`          | No                   | `single-owner` (default) or `open-sign-up`. See "Account modes" below.                |
| `APP_OWNER_EMAIL`           | In single-owner mode | Email of the one account allowed to use the app.                                      |
| `APP_TRUSTED_ORIGINS`       | No                   | Comma-separated frontend origins allowed to call the API.                             |
| `APP_CLIENT_ADDRESS_HEADER` | No                   | Set only behind a proxy: the request header in which it reports the caller's address. |
| `HOST`                      | No                   | Address the server binds to. Default `127.0.0.1`.                                     |
| `PORT`                      | No                   | Port the server listens on. Default `3000`.                                           |
| `LOG_FORMAT`                | No                   | `json` (default) or `pretty`. `.env.example` sets `pretty` for development.           |
| `LOG_LEVEL`                 | No                   | Lowest level to log: `debug`, `info` (default), `warn`, or `error`.                   |
| `VITE_API_BASE_URL`         | No                   | Frontend only. The API's absolute URL, when it is not on the page's origin.           |

Generate a secret with:

```sh
pnpm exec node --input-type=module -e 'import { randomBytes } from "node:crypto"; console.log(randomBytes(32).toString("base64"))'
```

### Account modes

`APP_ACCOUNT_MODE` selects who can have an account. A project selects one mode
and keeps it.

- `single-owner`: one account exists, for `APP_OWNER_EMAIL`. The
  `auth:setup-owner` command creates it. Nobody can sign up, and a session for
  any other email is refused.
- `open-sign-up`: each visitor can make an account at `/sign-up`, and every
  account is admitted. `APP_OWNER_EMAIL` and `auth:setup-owner` have no use.
  This mode does not verify email addresses, and a user cannot reset a
  password without an operator; see [decisions](decisions.md#authentication).

### A lost password

`pnpm run auth:reset-password` sets a new password for an account, and ends
each session of that account. It asks for the password in an interactive
terminal, as `auth:setup-owner` does.

- In single-owner mode, give no argument. The account is the owner's.
- In open sign-up mode, give the email address of the account:
  `pnpm run auth:reset-password person@example.com`.

## First run

1. Run `pnpm install`.
2. Create `.env` as described above.
3. In single-owner mode, run `pnpm run auth:setup-owner` in a terminal. It
   applies the schema migrations and prompts for the owner's name and
   password. It needs an interactive terminal; a password is never accepted as
   an argument. In open sign-up mode, skip this step.
4. Run `pnpm run dev`, then open `http://localhost:5173`. In open sign-up
   mode, make the first account there.

## Development

`pnpm run dev` builds `common` and the backend once, then keeps four processes
running: a TypeScript compiler in watch mode for `common`, another for the
backend, the backend server, and the Vite dev server.

- A change in the backend restarts the server.
- A change in `common` restarts the server and reloads the page.
- A change in the frontend updates the page without a reload.

The Vite dev server forwards `/api` to the backend. It reads `HOST` and `PORT`
as the backend does, from the process environment and then from the root
`.env`, so a changed port needs no other setting. It holds each API request
until the backend answers its health route, so a request during a restart
waits for up to 10 seconds and does not fail.

A change to `.env` needs a restart of `pnpm run dev`.

### The branch at the start of an agent session

When a Claude Code or Codex session starts,
`.agents/hooks/check-branch-is-current.mjs` fetches `main` from the remote
that the branch tracks, or from `origin` for a branch that tracks none. When
the branch is behind that `main`, the hook tells the agent and you how many
commits it is behind, and what to do. So a template branch in a project's
repository compares with the template's `main`. The hook says nothing when the
fetch fails, as it does with no network. Codex runs it only after you trust
the hooks of the repository.

### Slow commands of an agent

After each shell command of a Claude Code or Codex agent,
`.agents/hooks/warn-slow-commands.mjs` tells the agent how long the command
took, if it took more than 1 minute. After 5 minutes, the message is stronger.
The message tells the agent to run only the checks of the code that it
changed, and to run the full checks one time at the end. Without it, an agent
can run minutes of tests after each small change, because it does not see the
time that a command takes. The message goes only to the agent. It does not
stop the command.

Claude Code gives the hook the time of the command. Codex does not, so the
hook writes the start time of each command to a file in the temporary
directory of the system, and deletes the file when the command ends. A
background command of Claude Code ends at once, so the hook does not see its
time.

### The development database

`pnpm run dev`, `pnpm run db:migrate`, and `pnpm run auth:setup-owner` make
sure that a database answers at `DATABASE_URL` before they do their work:

- When the URL names this machine and nothing answers on its port, they start
  the embedded PostgreSQL there and stop it when the command ends. Its data is
  in `.data/postgres/`, which Git ignores, so each checkout and each Git
  worktree has its own database. Its log is in `.data/postgres.log`.
- When a PostgreSQL already answers there, such as one from Homebrew or
  Postgres.app, they use it. To use your own, put its URL in `.env`.
- A URL for another machine is used as it is.

`pnpm run dev` also applies the schema migrations first, but only to a database
on this machine. `pnpm run db:reset` deletes the embedded database, for a new
start.

The embedded PostgreSQL comes from the `embedded-postgres` package. The
database user and password in `.env.example` are for this local database only.

### The pre-commit hook

`pnpm install` installs a Git pre-commit hook that runs `lint-staged`. Its
configuration in `package.json` runs three commands on the staged files:

1. [`scripts/check-staged-secrets.mjs`](../../scripts/check-staged-secrets.mjs)
   stops the commit when the staged changes have an obvious secret: a file of
   environment variables such as `.env.production`, a private key file, or a
   token in a well-known format. It reads only the lines that the commit adds,
   and it shows the file and the line, not the value. The script lists the
   formats.
2. [`scripts/check-staged-file-size.mjs`](../../scripts/check-staged-file-size.mjs)
   stops the commit when it adds a file over 5,000 tokens, or makes such a
   file larger. It counts a token for each 4 bytes. A file that is over the
   limit can get smaller or keep its size. The message says how to split a
   file. The check skips binary files, and the files that `.gitattributes`
   marks as `linguist-generated`, such as `pnpm-lock.yaml`. Mark generated
   code there also.
3. Prettier formats the staged files.

When a value that the check finds is not a secret, such as a key that only a
test uses, commit again with `SKIP_SECRET_CHECK=1` in the environment. An
agent asks its person first. The agent review of each pull request looks for
the secrets and private data that the check cannot find. See
[Agent review of pull requests](agent-review.md).

## Database migrations

- `pnpm run db:migration:create <name>` creates a migration file in
  `backend/src/features/core/database/migrations/` and adds it to the list.
  The rules for its content are in
  [code architecture](code-architecture.md#database-schema).
- `pnpm run db:migrate` applies every migration that the database in
  `DATABASE_URL` does not have yet. It prints the database name and host first.
- To migrate another database, set the URL for that one command:
  `DATABASE_URL=postgresql://… pnpm run db:migrate`. The other required
  variables still come from `.env`.
- `pnpm run check` fails when a migration that the branch adds changes a table
  that another migration of the branch creates. `pnpm run db:migration:create`
  names the migrations that the branch adds already.
- `hasDeployedDatabase` in `backend/src/features/core/database/deployment.json`
  is `false` until a database with data runs the migrations. While it is
  `false`, a branch can change a migration that is on `main`, and each
  developer runs `pnpm run db:reset` after the merge.
- A database keeps a hash of each migration that it ran. When the file of
  such a migration changed or is gone, `pnpm run db:migrate` and
  `pnpm run dev` apply no migration, and name the files. For a development
  database, run `pnpm run db:reset`.

## Changes from the template

`template-version.json` is in a project that started from the template. It
names the template, and the last template commit that the project has.

`pnpm run template:sync <command>` takes the later commits of the template
into the project. The `sync-template` skill has the order of its commands, and
[`scripts/sync-template.mjs`](../../scripts/sync-template.mjs) describes each
one. `pnpm run template:sync plan` changes no file. It fetches the template
and lists the new commits.

### Rules of one project

`AGENTS.md` comes from the template, so a project writes its own rules for each
task in `docs/agents/project/rules.md`. A bare line in `AGENTS.md` loads that
file. Claude Code expands the `@` import when it loads `AGENTS.md`, and Codex
opens the file because the line tells it to. When the file does not exist,
neither agent shows an error.

A `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` in the working
directory or above it stops Claude Code from reading `AGENTS.md`, so it then
reads neither file. This includes a personal `CLAUDE.local.md`. Put the line
`@AGENTS.md` in such a file. Claude Code before version 2.1.277 reads only
`CLAUDE.md` files, so it needs the same line.

### Swamp

The workflows in `workflows/` run those commands in order, with
[Swamp](https://github.com/swamp-club/swamp). Swamp is optional. Without it, a
person or an agent runs the same commands, and the result is the same.

- Install Swamp one time on each machine:
  `curl -fsSL https://swamp-club.com/install.sh | sh`.
- Each Swamp command needs an account at swamp-club.com, also for a run on
  your own machine. `swamp auth login` signs in, and makes the account the
  first time.
- A clone needs no other setup. `.swamp.yaml` in the repository makes it a
  Swamp repository, and has the ID of the repository for Swamp.
- Run a workflow from the root of the repository:
  `swamp workflow run sync-template`.
- When a step fails, correct the cause. Then run that step again, and each
  step after it, with the command that Swamp prints:
  `swamp workflow resume sync-template --run <run id>`.
- Swamp keeps a record of each run in `.swamp/`, which Git ignores.
  `swamp workflow history get sync-template` shows the last run.
- Swamp's telemetry is off for this repository, with
  `telemetryDisabled: true` in `.swamp.yaml`. With telemetry on, Swamp sends
  usage data for each command to swamp-club.com, with the key of your
  account. The data has the command, the names of the workflow and its steps,
  the duration, and the error when a command fails.

### Files that come from the template

`templateOwned` in
[`scripts/template-paths.json`](../../scripts/template-paths.json) lists the
files that a project takes from the template and does not change, such as
`AGENTS.md`, the documents in `docs/agents/`, the lint rules, and
`.oxlintrc.json`, which turns the lint rules on. A change to one of them goes
to the template first. A project's own text goes in `docs/agents/project/`.

In a project, a hook stops an agent's edit of one of those files. Claude Code
asks you first. Codex refuses the edit, and its agent describes the change to
you. The hook does nothing in the template, and nothing while a sync waits at
a conflict.

Codex runs the hooks of a repository only after you trust them. Codex asks
the first time, and again after each change to `.codex/hooks.json`.

The "Template-owned files" check of CI fails a pull request that changes one
of those files. It passes when a maintainer opened the pull request, or when
a maintainer added the `template-change-approved` label after a review. A
later push that changes the pull request's own change to one of the files
removes the label. A merge or a rebase of `main` into the branch does not
remove it, unless `main` changed lines next to that change. When the check
removes the label, its log names the files and links to the changes of the
push. The check does nothing in the template.

The hook and the check treat the files in `personOnly` the same way. Those
files are the project's own, but they can loosen a rule. `reversals.md` in
`docs/agents/project/` is such a file. See
[Reverse a decision](README.md#reverse-a-decision).

A project needs two settings on GitHub for the check. Make them one time,
after the first push:

```sh
gh variable set TEMPLATE_MAINTAINERS --body "<login>,<login>"
gh label create template-change-approved --color 0e8a16 \
  --description "A maintainer approved a change to a file from the template"
```

`TEMPLATE_MAINTAINERS` has the GitHub logins of the persons who can approve
such a change. A pull request cannot change the variable. Without it, the
check fails each change to one of those files. On the GitHub Free plan, a
failed check does not stop a merge. With a paid plan, make "CI passed",
"Template-owned files", and "Agent review" required in the branch protection
of `main`. Do not require another job of `ci.yml`, because GitHub counts a
skipped job as passed. Do not require a workflow with a path filter, because
most pull requests get no result from it and stay blocked.

## Agent review of pull requests

[Agent review](agent-review.md) describes the review of each pull request by
models in CI: its rules, its labels, and the secrets of its models.

## Beads issue tracker

[Beads](beads.md) describes the issue tracker: its version, how to join a
project that uses it, and how to turn it on in a new project.

## Production

The repository has no deployment files yet. These facts hold on any host:

- Build with `pnpm run build`. Start the backend with
  `pnpm --filter backend start`.
- Leave `LOG_FORMAT` unset. The backend then writes one JSON object for each
  log line to standard output.
- Point the host's liveness check at `GET /health` and its readiness check at
  `GET /health/ready`.
- Behind a proxy or load balancer, set `APP_CLIENT_ADDRESS_HEADER` to the
  header in which it reports the caller's address, such as `x-forwarded-for`.
  Without it, every caller has the proxy's address and shares one sign-in rate
  limit.
- Use an HTTPS `BETTER_AUTH_URL`. Session cookies are then `Secure`.
- Run `pnpm run db:migrate` before the first start and before the start of
  each new version. The server does not migrate by itself.
- Before the first deploy of a database with data, set `hasDeployedDatabase`
  to `true` in `backend/src/features/core/database/deployment.json`.
  `pnpm run check` then fails on a change to a migration that is on `main`.
- When a user lost the password, run
  `pnpm --filter backend run auth:reset-password` on the host, in an
  interactive terminal and with the server's environment.

## Commands

| Command                               | Purpose                                               |
| ------------------------------------- | ----------------------------------------------------- |
| `pnpm run dev`                        | Start the backend and the frontend in watch mode.     |
| `pnpm run check`                      | Every check that CI runs, with the steps in parallel. |
| `pnpm run ci:checks`                  | The same without the tests. CI runs the two apart.    |
| `pnpm run typecheck`                  | Type-check all workspaces.                            |
| `pnpm run build`                      | Build all workspaces.                                 |
| `pnpm run test`                       | Hook tests, then every workspace's tests.             |
| `pnpm run lint`                       | Lint the workspaces.                                  |
| `pnpm run format`                     | Format every file with Prettier.                      |
| `pnpm --filter backend dev`           | Start only the backend in watch mode.                 |
| `pnpm --filter backend start`         | Start the built backend server, without watch mode.   |
| `pnpm run db:migrate`                 | Apply the schema migrations to the database.          |
| `pnpm run db:migration:create <name>` | Create a schema migration file.                       |
| `pnpm run db:reset`                   | Delete the embedded development database.             |
| `pnpm run template:sync plan`         | List the new commits of the template.                 |
| `pnpm run auth:setup-owner`           | Create the owner account.                             |
| `pnpm run auth:reset-password`        | Set a new password for an account.                    |
| `pnpm --filter frontend dev`          | Start only the frontend dev server.                   |
| `pnpm --filter frontend test`         | Run the frontend tests and print the coverage report. |
| `pnpm run test:feature <path>`        | Build, then run the app tests in one path.            |
| `pnpm run test:browser`               | Run the build checks and the black box tests.         |
| `pnpm run test:browser:install`       | Download the browser for the browser tests, once.     |
| `pnpm run test:live-start`            | Start the built backend on a real PostgreSQL.         |

Frontend development, type checks, and tests build the backend and `common`
first, because the commands take the backend's API types and the shared code
from the build output in `dist`.

An editor needs no build. Each `tsconfig.json` names the other workspaces in
`references`, so the editor's TypeScript server reads their source. It shows
correct types after a clone, a checkout, or a pull, also when `dist` is old or
absent.
