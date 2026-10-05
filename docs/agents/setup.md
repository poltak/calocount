# Setup and commands

## Requirements

- pnpm, at the version in `package.json`. pnpm downloads the Node version the
  repository pins, so run Node through pnpm (`pnpm run …`, `pnpm exec node …`).
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
- When a user lost the password, run
  `pnpm --filter backend run auth:reset-password` on the host, in an
  interactive terminal and with the server's environment.

## Commands

| Command                               | Purpose                                               |
| ------------------------------------- | ----------------------------------------------------- |
| `pnpm run dev`                        | Start the backend and the frontend in watch mode.     |
| `pnpm run check`                      | Every check that CI runs, with the steps in parallel. |
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
