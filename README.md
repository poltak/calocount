# WorldBrain boilerplate

A template for a web application: a Hono backend, a React frontend, and code
that both share, in one pnpm workspace. A new project starts from this
repository and keeps its Git history, so that it can take later template
changes.

## What is in it

- **Three workspaces.** `backend`, `frontend`, and `common`, with one
  architecture and lint rules that enforce it.
- **Authentication.** Better Auth behind our own routes, with two account
  modes: one owner, or open sign-up.
- **An example feature.** Notes, with its table, routes, pages, and tests. It
  is the model for a new feature.
- **A database with no setup.** `pnpm run dev` starts an embedded PostgreSQL.
- **Checks.** Types, lint, tests against the full application, browser tests
  of the built frontend, and a start of the live server. CI runs all of them.
- **Dependency updates.** Renovate opens the pull requests, and CI decides if
  they merge.
- **Two workflows for the template.** One starts a project from a clone, and
  one takes later template changes into a project. Each one is a script with
  tests, and a [Swamp](https://github.com/swamp-club/swamp) workflow runs it.

## Run it

You need the Node version in `.nvmrc` and pnpm.

```sh
pnpm install
cp .env.example .env
```

Put a secret and your email address in `.env`, as
[setup](docs/agents/setup.md) describes. Then:

```sh
pnpm run auth:setup-owner
pnpm run dev
```

Open `http://localhost:5173` and sign in.

## Start a project from it

Clone this repository, and run the `start-project` workflow in the clone.
[The template](docs/agents/template.md) has the steps. Do not use GitHub's
"Use this template" button and do not fork: a project needs the template's
history.

## Documents

The documents are in [`docs/agents/`](docs/agents/README.md). They are written
for coding agents and for people. `AGENTS.md` has the rules for every change.
