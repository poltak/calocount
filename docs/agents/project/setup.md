# Calocount setup

How to run what the project adds. Read this file when you read
[setup and commands](../setup.md).

## The old app

The old app is the `legacy` workspace. The root checks skip it.

```sh
pnpm --filter legacy run dev
pnpm --filter legacy run check
```

## Black-box tests

```sh
pnpm run test:browser:install
cd frontend
pnpm exec playwright test                               # against the old app
BLACK_BOX_TARGET=next pnpm exec playwright test         # against the new app
LEGACY_BLACK_BOX_PORT=4284 pnpm exec playwright test    # other ports
```

The old app uses `LEGACY_BLACK_BOX_PORT` and the next port, 4274 and 4275 by
default. A worktree that runs the tests at the same time as another one needs
other ports. The first run builds the old app, and a later run builds it again
only when one of its inputs changed.

## Git hooks

Install with `SKIP_INSTALL_SIMPLE_GIT_HOOKS=1 pnpm install` until beads issue
`calocount-s61` is closed. The repository's `core.hooksPath` points to the
beads hooks of the main checkout, and a plain install writes the template's
hook over them.
