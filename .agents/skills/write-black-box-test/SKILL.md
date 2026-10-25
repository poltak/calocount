---
name: write-black-box-test
description: Write black box tests of a user workflow, in Playwright against the built app, with page objects that hold what the tests know about each page. Use when asked to add black box tests, browser tests of a workflow, or tests of what a user sees, or when a change to a page breaks a black box test.
---

# Write a black box test

A black box test does what a user does in a real browser, and checks only what
the user can see. Read "Black box tests" in `docs/agents/testing.md` for the
rules, and the files in `frontend/src/features/auth/black-box-tests/` for the
models,
before you start. This skill is the order of work.

## Workflow

1. Name the workflow from the user's view: what the user wants to do, and the
   result that the user sees. For example, "make an account, and be signed
   in". The test file is `<workflow>.spec.ts`, in the `black-box-tests/`
   directory of the feature that owns the workflow.
2. Write the specification of the workflow as a list of rules in plain words,
   such as "a password has at least 8 characters". Get the rules from the
   person's request, from the pages, and from the UI Logic tests. For a
   workflow that exists, what the app does now is the starting point. Ask the
   person to confirm the rules that matter, and each behavior that looks
   wrong.
3. List the cases:
   - the success case of the main path;
   - for each rule about an input, one value from each group of values that the
     rule treats the same, and the values at the edges of each group, such as a
     password of 7 characters and one of 8;
   - each failure that a user can meet: invalid input, a lost connection, no
     session, or refused access.

   Keep the cases that a user relies on. Leave the timing cases to the UI Logic
   tests.

4. Write or extend the page object of each page that the workflow uses:
   - First look for the page objects that exist, in the `black-box-tests/`
     directory of each feature. Each page has one page object, also for the
     tests of other features.
   - Get the roles, labels, and texts from the page component, or from the
     accessibility tree in `error-context.md` after a run that failed.
   - Write a step for each thing that a user does on the page, and a locator
     for each thing that a test checks.
   - When a step opens a page that has an element that the old page also has,
     end the step with `waitFor()` on an element that only the new page has.
   - When an element has no accessible name, give it one in the component.
5. Write the success test. Open the first page with the `goto()` of its page
   object, do the steps, and check the result with `expect` on the locators of
   the page objects. To check that the backend kept a change, reload the page
   and check again.
6. Write one test for each other case from step 3. A test of a refused input
   checks the message, that the input stays in its field, and that nothing
   changed after a reload.
7. Make each new check fail one time: change the expected text in the test, run
   it, see the failure, and change the text back. A check that cannot fail
   checks nothing.
8. Run the tests, then the full checks:
   ```sh
   pnpm run test:browser
   pnpm run check
   ```
   To run one file after a first run has built the backend:
   `pnpm --filter frontend exec playwright test <path-from-frontend>`.

## Gotchas

- Playwright finds a name as a part of a longer text, and ignores case. So
  `getByLabel("Note")` also finds a field with the label "Notes". Use
  `exact: true` when one name is a part of another.
- A page object that waits with `expect` fails lint. Use `waitFor()` there.
- A test runs in the project's account mode by default. When a test depends
  on one mode, set it with `test.use({ accountMode })`, because another
  project can run in the other mode.
- When the fixture reports "Normal use must not cause an error that no code
  caught", the page threw an error. Read the error in the report, and fix the
  page, not the test.
- When you cannot produce a condition through the UI or with
  `context.setOffline(true)`, extend the fixture in
  `frontend/src/features/core/black-box-tests/black-box-test.ts`, and record the
  new control in `docs/agents/testing.md`. Lint rejects `page.route` and
  `page.evaluate` in black box tests.
- A change to the backend needs a new build of it. `pnpm run test:browser`
  builds it, and a bare `playwright test` does not.
- Each run builds the frontend again before the first test starts, and the
  tests run one at a time, because the build has one backend address in it.
  Do not set `workers` above 1.
