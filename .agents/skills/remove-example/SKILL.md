---
name: remove-example
description: Remove the notes example feature from a project that started from the template. Use when asked to remove the notes example, the example feature, or the activity feature, after the project has a feature of its own.
---

# Remove the notes example

The example is two backend features, `notes` and `activity`, and one frontend
feature, `notes`. The documents and two skills name it as the model for a
feature, and parts of `core` have no other user. So remove it only when the
project has a feature of its own that can take its place.

No script does this work. What must replace the example, and which parts of
`core` stay in use, depend on the project's own code.

## Ask the person first

- Which feature of the project is the model for a feature from now on.
- Which page the start path `/` shows.

## Workflow

1. Delete the three directories in `example`, and the three migrations in
   `withExample`. Both lists are in `scripts/template-paths.json`. Keep the
   migration `create-set-updated-at-function`. Then write the list of
   migrations again:
   ```sh
   pnpm run db:migration:create --sync
   ```
2. Remove the example from the backend's composition, in
   `backend/src/features/core/`:
   - In `database/database.ts`, remove the two imports, and the two names
     after `extends`.
   - In `database/standard-columns.ts`, remove `"activity"` from
     `APPEND_ONLY_TABLES`.
   - In `types.ts` and `compose-app.ts`, remove the Storage and Logic entries,
     and their imports.
   - In `server/http-app.ts`, remove the `/notes` route, and its import.
3. Remove the example from the frontend's composition, in
   `frontend/src/features/core/`:
   - In `types.ts`, `live/index.ts`, and `tests/index.ts`, remove
     `notesDrafts`, and its import.
   - In `ui/routes.tsx`, remove the two routes, the navigation link, and the
     two imports. Give the start path and the link of the "Page not found"
     section the page that the person named.
   - In `ui/app.css`, remove the `.note-form` and `.note-list` rules.
4. Point each test that uses a notes route at a route of the project:
   - `frontend/src/features/api/client/api-client.test.ts`.
   - `frontend/src/features/core/tests/browser/built-app.spec.ts`. It needs a
     page with a list, a link to a second page, and data that a test can make
     malformed.
   - The test "should sign out when another request finds that the session
     has ended" in `frontend/src/features/auth/ui/auth-logic.test.ts`. It
     needs a request to a route behind the session gate.
5. Run `pnpm run check`. It names code that only the example used. In the
   template these are:
   - `transaction` in `compose-app.ts`, and `BackendTransactionProps`.
   - `browserStorage` in the frontend's `live/index.ts`.
   - `encodeApiParam`, `useSignedInUser`, and `useAuthEvents`.

   Keep each one that a feature of the project uses. Remove each one that no
   code uses. The template's history has it, for a feature that needs it
   later.
6. Change the documents that name the example, so that they name the
   project's feature:
   - The rows of the table in `docs/agents/README.md`.
   - "What a test is here" in `docs/agents/testing.md`.
   - The decisions about the example in `docs/agents/decisions.md`.
   - The `add-feature` and `write-integration-test` skills.

   `git grep -n -i -E "note|activity" -- docs .agents` finds each location.
7. Run every check:
   ```sh
   pnpm run check
   pnpm run test:browser
   pnpm run test:live-start
   ```
8. Delete this skill: `.agents/skills/remove-example/` and the symlink
   `.claude/skills/remove-example`.

## Gotchas

- Do not delete a migration in a project that has a database with real data.
  Write a migration that drops the two tables.
- After this, the `sync-template` workflow leaves out each later template
  change to the example's files. A template change to the example's lines in
  a `core` file is a conflict, and `sync-template` stops there. Keep the
  project's version.
