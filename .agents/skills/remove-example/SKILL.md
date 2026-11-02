---
name: remove-example
description: Remove the notes example feature from a project that started from the template. Use when asked to remove the notes example, the example feature, or the activity feature.
---

# Remove the notes example

The example is two backend features, `notes` and `activity`, one frontend
feature, `notes`, and one browser test. It is the model for a feature, and
parts of `core` have no other user. So remove it when the project has a feature
of its own that can take its place, or when the project will bring in its own
code and has no use for the example's pages.

No script does this work. What must replace the example, and which parts of
`core` stay in use, depend on the project's own code. This skill changes no
file from the template, so a later sync has no conflict in those files.

## Ask the person first

- Which feature of the project is the model for a feature from now on. A
  project that has no feature yet can give this answer with its first feature.
- Which page the start path `/` shows. A project that has no page yet shows a
  heading with the product name there.

## Workflow

1. Name the new model feature. In `docs/agents/project/rules.md`, add a section
   with the feature's name, and copy the table of
   `frontend/src/features/notes/README.md`, with the project's own files in it.
   A project with no feature yet leaves this out, and adds the section with
   its first feature.
2. Delete the three directories in `example`, and each entry of `withExample`
   except this skill. Both lists are in `scripts/template-paths.json`. Keep the
   migration `create-set-updated-at-function`. Then write the list of
   migrations again:
   ```sh
   pnpm run db:migration:create --sync
   ```
3. Remove the example from the backend's composition, in
   `backend/src/features/core/`:
   - In `database/database.ts`, remove the two imports, and the two names
     after `extends`.
   - In `database/standard-columns.ts`, remove `"activity"` from
     `APPEND_ONLY_TABLES`.
   - In `types.ts` and `compose-app.ts`, remove the Storage and Logic entries,
     and their imports.
   - In `server/http-app.ts`, remove the `/notes` route, and its import.
4. Remove the example from the frontend's composition, in
   `frontend/src/features/core/`:
   - In `types.ts`, `live/index.ts`, and `tests/index.ts`, remove
     `notesDrafts`, and its import.
   - In `ui/routes.tsx`, remove the two routes, the navigation link, and the
     two imports. Give the start path and the link of the "Page not found"
     section the page that the person named. With no such page, `/` shows an
     `h1` with `APP_NAME`, and the link goes to `/`.
   - In `ui/app.css`, remove the `.note-form` and `.note-list` rules.
5. Run `pnpm run check`. It names code that only the example used. In the
   template these are:
   - `transaction` in `compose-app.ts`, and `BackendTransactionProps`.
   - `browserStorage` in the frontend's `live/index.ts`.
   - `encodeApiParam`, `useSignedInUser`, and `useAuthEvents`.

   Keep each one that a feature of the project uses. Remove each one that no
   code uses. The template's history has it, for a feature that needs it
   later.
6. Run every check:
   ```sh
   pnpm run check
   pnpm run test:browser
   pnpm run test:live-start
   ```
7. Delete this skill: `.agents/skills/remove-example/` and the symlink
   `.claude/skills/remove-example`.

## Gotchas

- Do not delete a migration in a project that has a database with real data.
  Write a migration that drops the two tables.
- After this, the `sync-template` workflow leaves out each later template
  change to the example's files. A template change to the example's lines in
  a `core` file is a conflict, and `sync-template` stops there. Keep the
  project's version.
- The browser test of the example has a check of the page error boundary, and
  `built-app.spec.ts` does not, because it needs a page that a test can make
  fail. Copy that test to the first page of the project that shows data.
