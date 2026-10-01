# Setup and commands

## Requirements

- pnpm, at the version in `package.json`. pnpm downloads the Node version the
  repository pins, so run Node through pnpm (`pnpm run …`, `pnpm exec node …`).
- A PostgreSQL database for the live backend. Tests need no database server.

## Environment

Backend commands read the root `.env`. Values already set in the process
environment take precedence. Copy `.env.example` to `.env` and keep `.env`
private and untracked.

| Variable                 | Required | Meaning                                                                   |
| ------------------------ | -------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`           | Yes      | PostgreSQL connection URL.                                                |
| `BETTER_AUTH_SECRET`     | Yes      | Session secret, at least 32 characters. No default exists.                |
| `BETTER_AUTH_URL`        | Yes      | The backend's HTTP(S) origin, without a path.                             |
| `SHADOW_OWNER_EMAIL`     | Yes      | Email of the one account allowed to use the app.                          |
| `SHADOW_TRUSTED_ORIGINS` | No       | Comma-separated frontend origins allowed to call the API.                 |
| `HOST`                   | No       | Address the server binds to. Default `127.0.0.1`.                         |
| `PORT`                   | No       | Port the server listens on. Default `3000`.                               |
| `VITE_API_BASE_URL`      | No       | Frontend only. API location when it is not served from the page's origin. |

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
4. Run `pnpm run build`, then `pnpm --filter backend start`.
5. Run `pnpm --filter frontend dev` for the frontend. Its dev server forwards
   `/api` to the backend at `127.0.0.1:3000`.

## Commands

| Command                                  | Purpose                                                |
| ---------------------------------------- | ------------------------------------------------------ |
| `pnpm run check`                         | Every check that CI runs.                              |
| `pnpm run typecheck`                     | Type-check all workspaces.                             |
| `pnpm run build`                         | Build all workspaces.                                  |
| `pnpm run test`                          | Hook tests, then every workspace's tests.              |
| `pnpm run lint`                          | Lint the workspaces.                                   |
| `pnpm run format`                        | Format every file with Prettier.                       |
| `pnpm --filter backend start`            | Start the built backend server.                        |
| `pnpm --filter backend auth:migrate`     | Apply auth schema updates without creating an account. |
| `pnpm --filter backend auth:setup-owner` | Create the owner account.                              |
| `pnpm --filter frontend dev`             | Start the frontend dev server.                         |
| `pnpm --filter frontend test`            | Run the frontend tests.                                |

Frontend development, type checks, and tests build the backend and `common`
first, because the frontend takes its API types from the backend's build output.
