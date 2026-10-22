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
| `VITE_API_BASE_URL`         | No                   | Frontend only. API location when it is not served from the page's origin.             |

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
`AGENTS.md`, the architecture document, the lint rules, and `.oxlintrc.json`,
which turns the lint rules on. A change to one of them goes to the template
first.

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
failed check does not stop a merge. With a paid plan, make the check
required in the branch protection of `main`.

## Agent review of pull requests

The "Agent review" workflow of CI gives each pull request to two models,
Claude Code and Codex. Each one reports rule violations that no lint
rule or test can check. An example is a doc's content that the change made no longer valid.
The script also reports each new document in `docs/agents/`.
[`scripts/agent-review.mjs`](../../scripts/agent-review.mjs) describes each
step.

- The general rules are in
  [`.agents/review/prompt.md`](../../.agents/review/prompt.md), which comes
  from the template.
- A project adds its own rules in `.agents/review/project-rules.md`. The
  project owns this file, and a sync never changes it. Without the file, the
  review uses only the general rules.

In `.agents/review/project-rules.md`, give each rule a heading such as
`### release-note`. Below the heading, say what to report, and give one
example, as the rules in `prompt.md` do. The model gets the file from its
first `###` heading to its end. The review deletes a finding whose rule
is in neither file. For example:

```md
### release-note

The pull request changes text that a user sees, and its description has no
line that starts with "Release note:". Quote the changed text.
```

The check works as follows:

- The "Agent review" job posts one comment on the pull request, and edits it
  after each review. GitHub keeps each earlier version of the comment. The job
  deletes each finding whose quote is not in the file that it names.
- The rules `secret` and `private-data` look at each commit of the pull
  request, because a value that a later commit deletes stays on GitHub. The
  quote of their finding can be in any commit. GitHub can send the comment by
  email, so the comment shows no quote from a file that has such a finding.
- Each model can also give up to three notes about a problem that no rule
  covers, such as a likely bug. The comment shows them under "Other notes".
  A note does not fail the check, and the label is not for notes.
- The models get the title and the description of the pull request, and they
  can read its commit messages, so a rule can ask for a reason there. An edit
  of the title or the description starts a new review.
- The job fails while a finding is open, and when a model that has its secret
  fails. When each finding is wrong or accepted, a maintainer adds the
  `agent-review-accepted` label. A later review with findings removes the
  label.
- Each pull request gets the review, also one that a maintainer opened. A
  draft gets its review when its author marks it as ready. A dependency update
  from Renovate or Dependabot gets no review.
- The models, their versions, and their effort are in `env` at the top of
  `.github/workflows/agent-review.yml`.
- Each model runs on the subscription of a person, and not on an API key. The
  reviews count against the usage limits of that subscription.
- A model without its secret does not run. With no secret, the workflow reviews nothing and passes.

The review uses `TEMPLATE_MAINTAINERS` from the
[template-owned check](#files-that-come-from-the-template). Make the label one
time:

```sh
gh label create agent-review-accepted --repo <owner>/<repo> --color 0e8a16 \
  --description "A maintainer accepted the findings of the agent review"
```

### The Claude Code secret

Run `claude setup-token`, and sign in with a Claude Pro or Max account. It
shows a token that starts with `sk-ant-oat01-`. Save it, and paste the token
when `gh` asks for the value:

```sh
gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <owner>/<repo>
```

### The Codex secrets

Codex keeps its login in a file, `auth.json`. When the login is about 8 days
old, Codex refreshes it during a run, and the old refresh token then stops
working. So the workflow saves the new file in the secret after each run, and
one Codex job runs at a time in the repository.

Make a separate login for CI. Do not copy your own `~/.codex/auth.json`. When
CI refreshes the copy, the login on your computer stops working.

```sh
mkdir -m 700 /tmp/codex-ci
printf 'cli_auth_credentials_store = "file"\n' > /tmp/codex-ci/config.toml
CODEX_HOME=/tmp/codex-ci codex login
jq '{auth_mode, has_refresh_token: (.tokens.refresh_token != null)}' \
  /tmp/codex-ci/auth.json
```

Sign in with a ChatGPT account that has Codex. The last command must show
`"auth_mode": "chatgpt"` and `"has_refresh_token": true`. Then save the file,
and delete the folder:

```sh
gh secret set CODEX_AUTH_JSON --repo <owner>/<repo> < /tmp/codex-ci/auth.json
rm -rf /tmp/codex-ci
```

The token of a workflow cannot write a secret, so the workflow needs a
personal access token to save the refreshed login:

1. Open https://github.com/settings/personal-access-tokens/new.
2. Set the resource owner to the owner of the repository, and "Repository
   access" to this repository only.
3. Under "Repository permissions", set "Secrets" to "Read and write".
4. Set an expiry, such as one year, and renew the token before that date.
5. Run `gh secret set CODEX_AUTH_WRITE_TOKEN --repo <owner>/<repo>`, and paste
   the token. If GitHub says that the organization must approve the token, an
   owner approves it under "Personal access tokens" in the settings of the
   organization.

When Codex refreshes the login and the job cannot save it, the job fails, and
`CODEX_AUTH_JSON` then has a login that does not work. Make a new login with
the steps above.

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
| `pnpm run test:browser`               | Run the browser tests of the built frontend.          |
| `pnpm run test:browser:install`       | Download the browser for the browser tests, once.     |
| `pnpm run test:live-start`            | Start the built backend on a real PostgreSQL.         |

Frontend development, type checks, and tests build the backend and `common`
first, because the commands take the backend's API types and the shared code
from the build output in `dist`.

An editor needs no build. Each `tsconfig.json` names the other workspaces in
`references`, so the editor's TypeScript server reads their source. It shows
correct types after a clone, a checkout, or a pull, also when `dist` is old or
absent.
