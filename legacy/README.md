# The old Calocount app

This folder holds the Calocount app as it was before the port onto the
template. It stays runnable until the new app in `backend/`, `frontend/` and
`common/` has each workflow. The black-box tests in
`frontend/src/features/*/black-box-tests/` run against this app, and later
against the new app, with no change to the tests.

Run its commands from the repository root with `--filter legacy`:

```sh
pnpm --filter legacy run dev
pnpm --filter legacy run check
```

The root checks (`pnpm run check`) skip this folder. Do not add new features
here. When the new app passes each black-box test, this folder is deleted.
