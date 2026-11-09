---
name: write-integration-test
description: Write integration tests for a UI Logic operation against the full application, asserting UI state and database rows before, during, and after. Use when adding or changing a UI Logic or LogicPlugin method, adding a backend route that a UI Logic calls, or when asked to add, fix, or extend tests.
---

# Write an integration test

Tests here call a UI Logic method and let the request run through the real
backend into an isolated database. Read `docs/agents/testing.md` for the rules
and `frontend/src/features/notes/ui/notes-logic.test.ts` for the model before
you start. This skill is the order of work.

## Workflow

1. Name the operation: one public method on one UI Logic or LogicPlugin class.
2. List what the operation touches:
   - the Logic state fields it reads or writes, including its `<name>State` and
     `<name>Error` task fields;
   - the database tables and columns it changes;
   - any other state, such as a fake Service or another Logic's events.
3. List the failures the operation can meet. Go through each of these and keep
   the ones that apply, then add any that are specific to the operation:
   - invalid input that the backend rejects;
   - a session that has expired or been removed;
   - access that the backend refuses;
   - a connection failure;
   - a second call while the first is running.
4. Open or create `<logic-file>.test.ts` beside the Logic. A new file needs a
   local `setupTest` that calls `setupLogicTest` and constructs the Logic, and
   small functions that read the rows the tests assert on. When the file is at
   the size limit of the pre-commit check, put the new tests in a file beside
   it that is named for their behavior, such as `auth-logic-sign-up.test.ts`,
   with its own local `setupTest`. Move the fixtures that two of the files
   share to a module beside them.
5. Write the success test in three parts:
   - before: assert the task is `pristine` and assert the starting UI state and
     database rows;
   - during: call the method without `await`, keep the promise, and assert the
     task is `running`;
   - after: await the promise, then assert `success`, the new UI state, and the
     new database rows.
6. Write one sibling test per failure from step 3. Produce the failure by real
   means: invalid input, rows changed in the database, `transport.goOffline()`,
   or a held request. Assert `error`, the error message, and that the UI state
   and database rows did not change.
7. Run the file, then the full checks:
   ```sh
   pnpm --filter frontend test
   pnpm run check
   ```
   To run one file: `pnpm run test:feature <path-from-frontend>`.

## Gotchas

- The "during" assertion works because `executeTask` sets `running` before its
  first `await`. A method that awaits something before calling `executeTask`
  breaks it; call `executeTask` first.
- To assert the database while a request is in flight, call
  `transport.holdNextRequest()` before the method and `await held.reached`
  before the assertions. Release it before awaiting the method's promise.
- A hold applies to the next request only. Create it immediately before the
  call it is meant for.
- If a condition cannot be produced without `vi.mock`, `vi.spyOn`, or a
  hand-written `fetch`, extend the fixture or the transport controls and record
  the new control in `docs/agents/testing.md`. Lint rejects test doubles in
  these files.
- A backend change needs a rebuild before frontend tests see it.
  `pnpm run test:feature` and `pnpm --filter frontend test` rebuild; a bare
  `vitest run` does not, and it passes or fails on old code.
- Do not write teardown. The fixture cleans up when the test finishes.
- The check fails when a function in a UI Logic file never runs in a test. Add
  a test for the operation it belongs to. Uncovered lines and branches do not
  fail the check; do not write a test only to cover one.
