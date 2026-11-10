# Calocount setup

How to run what the project adds. Read this file when you read
[setup and commands](../setup.md).

## The app

The app is one Worker. It serves the API and the built frontend on one
origin. `wrangler.jsonc` at the repository root holds its
config.

```sh
cp .dev.vars.example .dev.vars    # then set CALOCOUNT_SETUP_CODE
pnpm run dev                      # the Worker on a local D1, and Vite with hot reload
pnpm run build                    # the backend, and the frontend for one origin
pnpm run test:live-start          # starts the Worker on an empty local D1 and probes it
```

`pnpm run dev` (`scripts/dev.mjs`) builds the backend, applies the migrations
to the local D1, and starts two processes:

- `wrangler dev` on <http://127.0.0.1:8787>. It reloads on a change to the
  backend code. Its D1 state is in `.wrangler/state/`, and Git ignores it.
- The Vite dev server on <http://localhost:5173>, with hot reload. Open this
  one. It proxies `/api`, `/health`, `/mcp`, `/oauth`, `/.well-known`,
  `/llms.txt` and `/meal-photos` to the Worker, so the browser sees one origin.
  The proxy keeps the `Host` header, so the Worker sees `localhost` as the
  relying party. Passkeys need `localhost`, not `127.0.0.1`.

Stop both with Ctrl+C. To use another port for the Worker, set
`DEV_WORKER_PORT` in the environment or in `.env` (see `.env.example`).
Nothing in `.env` is a secret. The Worker reads only `.dev.vars` and the vars
of `wrangler.jsonc`. `pnpm run deploy` builds, applies the migrations to the
remote D1 and deploys. An agent never runs it.

## Black-box tests

```sh
pnpm run test:browser:install
cd frontend
pnpm exec playwright test
NEXT_BLACK_BOX_PORT=4294 pnpm exec playwright test    # another port
```

`scripts/black-box-next.mjs` starts the Worker on `NEXT_BLACK_BOX_PORT` (4284).
A worktree that runs the tests at the same time as another one needs another
port. Each run builds the backend and the frontend, then starts `wrangler dev`
on a fresh local D1 in `.wrangler/black-box/`.

The Worker has the setup code `black-box-setup-code` and the reset route. A
test with `authenticated: true` starts as the signed-in owner: the fixture
saves the owner's passkey on the sign-in page.

## Git hooks

Install with `SKIP_INSTALL_SIMPLE_GIT_HOOKS=1 pnpm install` until beads issue
`calocount-s61` is closed. The repository's `core.hooksPath` points to the
beads hooks of the main checkout, and a plain install writes the template's
hook over them.
