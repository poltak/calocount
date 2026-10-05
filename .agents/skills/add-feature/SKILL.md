---
name: add-feature
description: Add a new feature to the application, with its table, backend Storage, Logic, and routes, its frontend Logic and page, and their tests. Use when asked to add a feature, a new page that stores data, or a new resource with its own table and API routes.
---

# Add a feature

A feature has its own directory in each workspace that it needs:
`backend/src/features/<feature>/` and `frontend/src/features/<feature>/`. The
`notes` feature is the model for every step. Read
`docs/agents/code-architecture.md` and `docs/agents/testing.md` before you
start. This skill is the order of work and the list of files that every
feature must be added to.

## Workflow

1. Name the feature in kebab-case, such as `patient-records`. Its key in the
   Storage, Logic, and API collections is the camelCase form.
2. Create the table, if the feature stores data.
   - Run `pnpm run db:migration:create create-<table>`.
   - Write the `create table` statement with the three standard columns, and
     the `updatedAt` trigger. Copy both from `code-architecture.md` (Database
     schema).
   - Declare the table type in `backend/src/features/<feature>/storage/types.ts`.
     Extend `BaseTable`.
   - Add the feature's tables to `DatabaseSchema` in
     `backend/src/features/core/database/database.ts`.
3. Write the backend Storage class in `storage/<feature>-storage.ts`. Limit
   each query to the records that the user can read.
4. Write the backend Logic class in `logic/<feature>-logic.ts`. An operation
   with several writes runs them in `this.deps.transaction()`.
5. Write the routes in `handlers/<feature>-handlers.ts`. Validate each input
   with `validator()`.
6. Add the feature to the backend composition. All three are necessary:
   - `backend/src/features/core/types.ts`: the Storage and Logic collections.
   - `backend/src/features/core/compose-app.ts`: `createStorage`, and the
     `logic` object.
   - `backend/src/features/core/server/http-app.ts`: the route, in
     `createBusinessHttpApp` so that it is behind the session gate.
7. Run `pnpm --filter backend... run build`. The frontend takes the API types
   from the build.
8. Write the UI Logic class in `frontend/src/features/<feature>/ui/`, and its
   test file beside it. Use the `write-integration-test` skill for the tests.
9. Write the page component, and add its route and its navigation link in
   `frontend/src/features/core/ui/routes.tsx`.
10. If the feature has a frontend Storage or Service class, add it to
    `frontend/src/features/core/types.ts`, and construct it in
    `core/live/index.ts` and in `core/tests/index.ts`.
11. Run the checks:
    ```sh
    pnpm run check
    pnpm run test:browser
    ```

## Gotchas

- A new external system needs a Service, not a call from Logic. Add its
  interface to the Service collection in `core/types.ts`, and construct the
  live implementation in `core/live/index.ts` and a fake in
  `core/tests/index.ts`.
- `database-schema.test.ts` fails when a new table lacks a standard column or
  the trigger. Its message names what is missing.
- A table that only gets new records has no `updatedAt`. Extend
  `AppendOnlyTable`, and add the table's name to `APPEND_ONLY_TABLES`.
- Lint rejects a class in the wrong directory, a Logic that imports another
  feature, and a class that a composition file did not construct. Read the
  message: it cites the rule in `code-architecture.md`.
- Do not edit `backend/src/features/core/database/migrations.ts`. The
  migration command writes it.
