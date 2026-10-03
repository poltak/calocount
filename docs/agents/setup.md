# Setup and commands

## Requirements

- pnpm, at the version in `package.json`. pnpm downloads the Node version the
  repository pins, so run Node through pnpm (`pnpm run …`, `pnpm exec node …`).
- A PostgreSQL database for the live backend. Tests need no database server.

## Environment

Backend commands read the root `.env`. Values already set in the process
environment take precedence. Copy `.env.example` to `.env` and keep `.env`
private and untracked.

| Variable                       | Required | Meaning                                                                               |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | Yes      | PostgreSQL connection URL.                                                            |
| `BETTER_AUTH_SECRET`           | Yes      | Session secret, at least 32 characters. No default exists.                            |
| `BETTER_AUTH_URL`              | Yes      | The backend's HTTP(S) origin, without a path.                                         |
| `SHADOW_OWNER_EMAIL`           | Yes      | Email of the one account allowed to use the app.                                      |
| `SHADOW_TRUSTED_ORIGINS`       | No       | Comma-separated frontend origins allowed to call the API.                             |
| `SHADOW_CLIENT_ADDRESS_HEADER` | No       | Set only behind a proxy: the request header in which it reports the caller's address. |
| `HOST`                         | No       | Address the server binds to. Default `127.0.0.1`.                                     |
| `PORT`                         | No       | Port the server listens on. Default `3000`.                                           |
| `LOG_FORMAT`                   | No       | `json` (default) or `pretty`. `.env.example` sets `pretty` for development.           |
| `LOG_LEVEL`                    | No       | Lowest level to log: `debug`, `info` (default), `warn`, or `error`.                   |
| `VITE_API_BASE_URL`            | No       | Frontend only. API location when it is not served from the page's origin.             |

Generate a secret with:

```sh
pnpm exec node --input-type=module -e 'import { randomBytes } from "node:crypto"; console.log(randomBytes(32).toString("base64"))'
```

## First run

1. Run `pnpm install`.
2. Create `.env` as described above.
3. Run `pnpm --filter backend auth:setup-owner` in a terminal. It creates the
   auth tables and prompts for the owner's name and password. It needs an
   interactive terminal; a password is never accepted as an argument.
4. Run `pnpm run dev`, then open `http://localhost:5173`.

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

## Production

The repository has no deployment files yet. These facts hold on any host:

- Build with `pnpm run build`. Start the backend with
  `pnpm --filter backend start`.
- Leave `LOG_FORMAT` unset. The backend then writes one JSON object for each
  log line to standard output.
- Point the host's liveness check at `GET /health` and its readiness check at
  `GET /health/ready`.
- Behind a proxy or load balancer, set `SHADOW_CLIENT_ADDRESS_HEADER` to the
  header in which it reports the caller's address, such as `x-forwarded-for`.
  Without it, every caller has the proxy's address and shares one sign-in rate
  limit.
- Use an HTTPS `BETTER_AUTH_URL`. Session cookies are then `Secure`.
- Run `pnpm --filter backend auth:migrate` after an upgrade of Better Auth and
  before the first start. It also creates the table for the rate limits.

## Commands

| Command                                  | Purpose                                                |
| ---------------------------------------- | ------------------------------------------------------ |
| `pnpm run dev`                           | Start the backend and the frontend in watch mode.      |
| `pnpm run check`                         | Every check that CI runs, with the steps in parallel.  |
| `pnpm run typecheck`                     | Type-check all workspaces.                             |
| `pnpm run build`                         | Build all workspaces.                                  |
| `pnpm run test`                          | Hook tests, then every workspace's tests.              |
| `pnpm run lint`                          | Lint the workspaces.                                   |
| `pnpm run format`                        | Format every file with Prettier.                       |
| `pnpm --filter backend dev`              | Start only the backend in watch mode.                  |
| `pnpm --filter backend start`            | Start the built backend server, without watch mode.    |
| `pnpm --filter backend auth:migrate`     | Apply auth schema updates without creating an account. |
| `pnpm --filter backend auth:setup-owner` | Create the owner account.                              |
| `pnpm --filter frontend dev`             | Start only the frontend dev server.                    |
| `pnpm --filter frontend test`            | Run the frontend tests and print the coverage report.  |

Frontend development, type checks, and tests build the backend and `common`
first, because the frontend takes its API types from the backend's build output.
