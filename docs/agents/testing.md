# Testing

Read this before writing or changing a test. For the step-by-step workflow, use
the `write-integration-test` skill for a UI Logic test, and the
`write-black-box-test` skill for a black box test.

## What a test is here

Almost every test must be an integration test of one UI Logic operation (i.e., a user invoked action) against the
full application. The test calls a method on a UI Logic class. The request then
passes through the real API client, backend routes, validation, backend Logic,
Services, and an isolated in-memory PostgreSQL database, all in one process.
Nothing on that path is replaced/mocked.

The canonical example is
[`notes-logic.test.ts`](../../frontend/src/features/notes/ui/notes-logic.test.ts).
Copy its shape. Its test "should afford creating a note from the draft, and
empty the draft" is the model for a success case. The tests of `create` after
it are the model for failure cases. The file also shows how to seed rows
through the API.
[`note-edit-logic.test.ts`](../../frontend/src/features/notes/ui/note-edit-logic.test.ts)
shows a Logic whose `deps` name a record: its `setupTest` seeds the record in
an async `createLogic`.
[`auth-logic.test.ts`](../../frontend/src/features/auth/ui/auth-logic.test.ts)
shows tests of the session, and of a Logic that reacts to an event. A
LogicPlugin has a test file of its own, such as
[`note-draft-plugin.test.ts`](../../frontend/src/features/notes/ui/note-draft-plugin.test.ts).

Backend code has no test runner of its own. Handlers, backend Logic, and Storage
are covered through these tests. A project with code that runs only on another
runtime can run the same tests on [a second host](#a-second-test-host).

Each workflow that has stopped changing must also have
[black box tests](#black-box-tests). They check the workflow in a real browser,
and they know only what a user can see.

## A second test host

One test type can run on two hosts. Node is the default. A project adds a second
host when Node cannot run a part of its backend, such as a Cloudflare Durable
Object or a binding that only `workerd` has. A test on the second host has the
same form: `setupLogicTest`, one Logic method, and checks of state and of
`backend.db`. So it is the same test type, and the [rules](#rules) apply.

- `frontend/vite.config.ts` has a Vitest project for each host. In the project
  of the second host, a `resolve.alias` points `backend/testing` at a fixture
  for that host, so `full-application.ts` does not change.
- `global-setup.ts` runs on Node only. A fixture on another host builds its
  database in another way.
- Keep most tests on Node, because they start faster and they can use a DOM.
  Run a test on the second host when it needs that host, or when its Storage
  statements use a feature that the database of the Node host can hide.
- A host that cannot give each test a new copy of a database can keep one
  database for each test file. Each test there uses new IDs, and does not read
  a whole table. This is the one exception to the rule that a test has its own
  database.
- V8 coverage does not work on `workerd`, and one run has one provider. A
  coverage run that includes that host uses Istanbul.

## Rules

These rules are for the UI Logic tests. Black box tests have
[rules of their own](#rules-of-black-box-tests).

- **Test through a UI Logic method.** Do not render React components, and do not
  call backend Logic in place of the API path.
- **One test file per UI Logic or LogicPlugin, beside it.** Each file has a local
  `setupTest` that calls `setupLogicTest` and constructs the Logic under test.
  `setupTest` takes the same params in every file, including
  `skipInitialization` for tests of initialization itself.
- **Assert before, during, and after the operation,** on every level it
  touches: the Logic's state, the database rows, and any other state it changes.
  "During" means after calling the method without awaiting it (only applicable to async methods). Assert only state
  that is relevant to the operation.
- **Write one test for the success case and one sibling test for each
  anticipated failure.** Consider invalid input, a lost session, refused access,
  a connection failure, and a second call while the first is running. A failure
  test asserts the error state and message, and that the Logic's state and the
  database did not change.
- **Use no test doubles.** No `vi.mock`, `vi.spyOn`, or `vi.fn`, and no
  hand-written `fetch`. Third-party systems are the only exception: they run as
  the fake Service class implementations that the test composition roots construct (not test cases themselves).
- **Produce a failure by real means:** invalid input, rows changed in the
  database (such as an expired session), or the transport controls below. If a
  condition cannot be produced this way, extend the fixture; do not add a test
  double.
- **Read the database with direct queries on `backend.db`.** Do not add a
  Storage method for a test. Storage has methods only for production paths, and
  a direct query also checks what Storage wrote, independently of Storage.
  `backend.db` knows every table in `DatabaseSchema`, so a test declares no
  table types of its own.
- **Seed data through the application when a path exists.** Use a trusted
  backend operation when no route exists, such as creating an account. Write
  rows directly only for a condition that no operation can produce.
- **An operator command has no route.** Its test calls the backend Logic of
  the command, and asserts the effect through a UI Logic method. The password
  reset tests in `auth-logic.test.ts` show this.
- **Write no teardown.** The fixture cleans up the Logic and then closes the
  backend when the test finishes. A test body has no `try`/`finally` and the
  file has no `afterEach`.
- **Every test builds its own application.** Tests share no state, so each can
  run alone and test files run in parallel. Do not use `it.concurrent`; the
  automatic cleanup needs one test at a time within a file.

## The fixture

`setupLogicTest` in
[`full-application.ts`](../../frontend/src/features/core/tests/full-application.ts)
returns:

| Field                                                    | Meaning                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `logic`                                                  | The UI Logic being tested, with `initialize()` method automatically called unless `skipInitialization` set. |
| `frontend`                                               | The frontend app. Its fake Services can be driven, such as `focus()`.                                       |
| `frontend.browserStorage`                                | What frontend Storage classes stored, for direct reads and writes, like `backend.db`.                       |
| `backend`                                                | The backend app. `backend.db` is the test's own database.                                                   |
| `backend.services.logger` and `frontend.services.logger` | Loggers that keep what each app logged in `entries`.                                                        |
| `owner`                                                  | The owner account as stored when the test starts.                                                           |
| `auth`                                                   | The session's Logic, not initialized. A Logic under test takes its `events` in `deps`.                      |
| `transport`                                              | Controls for the requests the frontend sends. See below.                                                    |
| `restartBackend()`                                       | A second backend on the same database, with new Services, as after a restart of the server.                 |

The owner is signed in unless the test passes `authenticated: false`. The
owner signed in once, before the test run, so the database of a signed-in test
already has that session and the rate-limit row of that sign-in.

`auth` is the Logic that the auth provider owns in a browser. To test what a
Logic does when the user signs out, call `auth.initialize()` and then
`auth.signOut()`. `note-draft-plugin.test.ts` shows this.

The backend runs in single-owner mode unless the test passes
`accountMode: "openSignUp"`. In that mode a visitor can sign up, and the owner
is one user among others. The sign-up tests in `auth-logic.test.ts` use it.

`backendOptions` gives a test other inputs of the test backend: the inputs
that `createApp` in `backend/src/features/core/tests/index.ts` takes, past the
ones that the fixture sets. A project adds an input there, such as a setting
that only some tests turn on, and does not change the fixture. The fixture
files come from the template, and `templateOwned` lists them.

### Transport controls

The transport is the function the frontend uses to send a request to the
backend. In a test it hands the request to the backend's route code directly.
The fixture's transport can also reproduce timing and connection problems:

- `holdNextRequest()` makes the next request wait before the backend receives
  it. Use it to assert that nothing is stored yet while the operation runs.
- `holdNextResponse()` lets the backend handle the next request and makes the
  response wait. Use it to test an answer that arrives late.
- Both return `reached`, a promise that resolves when a request is waiting, and
  `release()`. A held request fails at once if its caller cancels it, as a real
  request does.
- `goOffline()` makes every request fail as a browser does without a
  connection. `goOnline()` restores it.
- `failNextRequestAtGateway(status)` answers the next request with a
  plain-text failure before the backend receives it, as a proxy or gateway in
  front of the backend does.

## Other tests

A few files that are not Logic classes have tests of their own:

- `api-client.test.ts` checks only the client's types, which no running test
  can check. The UI Logic tests cover its behavior.
- `latest-request.test.ts` tests a small helper that has no I/O.
- `use-logic.test.tsx` is the only Vitest test that renders components,
  because the hook's lifecycle exists only inside React. Do not add other
  rendered Vitest tests; UI components hold no logic of their own.
- `backend-http.test.ts` covers backend behavior that no UI Logic reaches: the
  health routes, the security headers, the request ID and request log, the
  request size limit, and the answer to an unexpected error. It sends requests
  through the fixture's transport, so the whole backend still runs. Add a test
  there only for behavior of the HTTP app itself. A route that a UI Logic calls
  gets its tests through that Logic.
- `database-schema.test.ts` reads the schema that the migrations made, and
  checks that every application table has the standard columns and the
  `updated_at` trigger. Its failure message names the table and what it needs.

## Browser tests

`pnpm run test:browser` opens the built frontend in a real browser, with
Playwright. It runs two kinds of tests, the `*.spec.ts` files:

- The build checks, in
  [`built-app.spec.ts`](../../frontend/src/features/core/tests/browser/built-app.spec.ts).
- The [black box tests](#black-box-tests), in the `black-box-tests/` directory
  of each feature.

Before the first run, `pnpm run test:browser:install` downloads the browser.

How they run:

- The frontend is built with `VITE_API_BASE_URL` set and served as static
  files on one origin. The test backend listens on another origin. It is the
  same backend as in the UI Logic tests, with an in-memory database and fake
  Services for third-party systems, so a run needs no database and no secrets.
- The build has one backend address in it. Each test file of build checks, and
  each black box test, starts its own backend at that address, so only one
  test runs at a time.

`pnpm run check` does not run them. CI runs them in a job of their own, on
each pull request and on each push to `main`. Run them yourself after a change
to `routes.tsx`, `main.tsx`, `vite.config.ts`, the API client's request
options, an error boundary, or a page that has a page object.

### Build checks

The build checks cover what only a real browser can show:

- The build output loads and starts, and React Router changes pages.
- The browser stores the session cookie from an API on another origin and
  sends it again, and the client joins the configured base URL correctly.
- The two error boundaries show their fallbacks and recover.

They do not cover the behavior of a feature. The UI Logic tests and the black
box tests do that. Add a build check only for something that neither can
reach.

- One backend with one database serves the whole file. Its tests run in order,
  share one page, and each starts where the test before it ended.
- A build check may answer a request itself with `page.route`, but only to
  produce an answer that the real backend never sends, such as the malformed
  data that makes a component throw.

## Black box tests

A black box test knows only what a user can see. It opens the built app in a
real browser, does the steps that a user does, and checks what the page shows.
It knows nothing about the Logic classes, their state, the tables, or the API
routes. So a refactor of the code inside does not change the test, and a
failure means that the behavior changed.

The models are
[`session.spec.ts`](../../frontend/src/features/auth/black-box-tests/session.spec.ts)
and
[`sign-up.spec.ts`](../../frontend/src/features/auth/black-box-tests/sign-up.spec.ts),
with their page objects beside them, and
[`app-shell-page-object.ts`](../../frontend/src/features/core/black-box-tests/app-shell-page-object.ts)
for the header.

### When to write one

Black box tests add to the UI Logic tests. They do not replace them. A UI Logic
test is faster, it shows which layer broke, and it can hold a request or read
the database while the request runs. A black box test shows that a workflow
works for the user through the whole app, and it stays valid when the code
inside changes.

- Each workflow must have black box tests when it is stable. The person
  decides when it is stable. While the person still tries layouts and steps,
  the UI Logic tests are enough. `AGENTS.md` says when an agent asks.
- Cover each rule that a user can see, because a refactor must keep each of
  them. This includes the limit of 3 sign-in attempts in 10 seconds, because a
  test makes 4 attempts in less than a second. Leave to the UI Logic tests
  what a browser cannot do the same way on each run, such as a second click
  while a request runs.
- Write the cases from the specification of the workflow, not from the code.
  Take one input from each group of inputs that the specification treats the
  same, and the inputs at the edges of each group. For example, a password has
  at least 8 characters, so `sign-up.spec.ts` tries a password of 7 characters
  and one of 8.
- Use inputs that pass the browser's own checks. The browser refuses an empty
  required field, or an email with no "@", before the app sees it, and its
  message is not on the page. So test an edge that the browser accepts and the
  app refuses, such as `owner@example`.

### Put the UI knowledge for each page in one place

A page object is a class that holds what the tests know about one page: its
path, how to find its elements, and the steps that a user does on it. The
Playwright documentation calls this pattern the page object model. A test calls
the steps of the page objects, and it checks the locators that they give. A
test finds no element itself.

The reason is the cost of a change to the UI. A black box test breaks when the
text or the steps change for the user. Without page objects, each test that
signs in has the labels "Email" and "Password" and the button "Sign in" in it.
If the sign-in page then asks for the email first, and for the password on a
second screen, each of those tests must change. With page objects, only
`SignInPageObject.signIn()` changes, and each test that calls it stays the
same. The tests describe the workflow, and the page objects describe the pages.

Changes to style and layout break no test, because a page object finds
elements by their role and accessible name, as a screen reader does. It does
not find them by markup or position.

How to write a page object:

- Name it after the page as the user knows it: `SignInPageObject` in
  `sign-in-page-object.ts` for the sign-in page. Put it in the
  `black-box-tests/` directory of the feature that owns the page. A part of
  the UI that many pages show, such as the header, gets a page object of its
  own in `core/black-box-tests/`. The header's page object is
  `AppShellPageObject`.
- Each page has one page object. A test of another feature uses it too, and
  lint permits that import, because a workflow can cross features.
- A step is a method for one thing that a user wants to do. Name it after that
  goal, such as `signIn()`, not after the elements that it uses.
- A locator is a field or a method that returns a Playwright `Locator`, for the
  checks of a test, such as `heading` or `userName(name)`.
- Find elements with `getByRole`, `getByLabel`, or `getByText`. Do not use CSS,
  XPath, or test IDs. When an element has no accessible name, give it one in
  the component, such as a label. A screen reader needs it too.
- A page object imports no application code, also not the product name. Find
  a text that has the product name with a pattern, such as `/^Sign in to /`.
- A page object does not check. The test checks with `expect`.
- A step that always leaves its page ends with
  `waitFor({ state: "hidden" })` on the heading of its page. Without the wait,
  the next step can act on the old page. For example, a list page and the page
  that edits one of its records can both have a "Title" field. The step waits
  for its own page to go, so two pages that link to each other need not import
  each other's page objects.

### Rules of black box tests

- **Take `test` from the black box fixture,**
  [`black-box-test.ts`](../../frontend/src/features/core/black-box-tests/black-box-test.ts).
  It gives each test its own backend.
- **Check only what a user can see:** text, fields, headings, and the URL. To
  check that the backend kept a change, reload the page or open it again. To
  check that a refused attempt changed nothing, do the step again with valid
  values, such as a sign-up with the same email.
- **Check the new page before a hidden element.** A check that an element is
  hidden passes at once, while the page has not changed yet. Put it after a
  check of an element that the new page shows.
- **Open a page with the `goto()` of its page object.** Use `page.goto()` only
  when the address itself is part of the case, such as a link that a user
  opens.
- **Use no page of the notes example in a test of another feature.** A project
  removes the example with the `remove-example` skill.
- **Make the data through the UI.** Each test starts with a database that holds
  only the owner account. The test makes the records that it needs with the
  steps of the page objects.
- **Produce a failure by real means:** invalid input, or
  `context.setOffline(true)` for a lost connection. Go offline only after the
  page shows its content, because the page's first requests fail too. Do not
  answer a request in
  the test with `page.route`, run code in the page with `page.evaluate`, or
  read the browser's storage. If you cannot produce a condition this way,
  extend the fixture, and record the new control here.
- **Wait for what a user waits for.** Playwright's actions and checks wait
  until the element is ready. Do not wait for a fixed time.
- **Write no teardown.** The fixture closes the backend after each test.

### The black box fixture

| Field   | Meaning                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`  | A page with its own backend and database. The fixture signs the owner in, unless the test sets `authenticated: false`. The page has not opened the app. |
| `owner` | The email, name, and password of the owner account.                                                                                                     |

A test file sets the options with `test.use()`:

- `authenticated`: sign the owner in before the test. Defaults to `true`. The
  fixture signs in through the session route, so only the tests of the
  sign-in page depend on that page.
- `accountMode`: `singleOwner` or `openSignUp`. Defaults to the mode that the
  project runs in, which is `singleOwner` in the template. In `openSignUp`
  mode a visitor can sign up. A test that depends on one mode sets it.

An error in the page that no code caught fails the test, because normal use
must not cause one.

Each worker builds the database template once, and each test starts its
backend from a copy. A test takes about half a second on a laptop. To run one
file after a first run has built the backend:
`pnpm --filter frontend exec playwright test src/features/auth/black-box-tests/session.spec.ts`.
When a test fails, Playwright writes a trace and `error-context.md` to
`frontend/.browser-test/results/`. That file has the error and the page's
accessibility tree, with the role and name of each element.

## The live start check

`pnpm run test:live-start` starts the built backend as a deployment does: the
live composition root, the `pg` driver, and a real PostgreSQL. No other test
runs these, because every other test uses the test root with an in-memory
database. [`check-live-start.mjs`](../../scripts/check-live-start.mjs) checks
that the server:

- starts with the configuration in `.env.example`, so the check also fails
  when that file lacks a variable that the server requires
- answers the readiness route, and a route that needs the migrated tables
- stays up and connects again after the database closes its connections
- ends by itself with exit code 0 on `SIGTERM`

It does not read `.env`. The database is a PostgreSQL that already answers at
the URL in `.env.example`, or the embedded one. `pnpm run check` does not run
it, and CI does. Run it yourself after a change to `server/start.ts`,
`live/index.ts`, `live/config.ts`, the files in `core/database/`, or
`.env.example`.

## Coverage

`pnpm --filter frontend test` measures which code ran during the tests and
prints a report. Because UI Logic tests run the whole path, the report covers
the backend as well as the frontend. CI runs the tests in four jobs, and a
fifth job, "Test coverage", merges their coverage and checks it.

- Every function in a UI Logic or LogicPlugin file must run in a test, or the
  check fails and names the file. This counts callbacks, such as an event
  listener, as well as methods.
- Lines and branches have no threshold, and neither does the backend. Read the
  report's uncovered lines as a list of cases to consider, not as a number to
  raise. Do not write a test only to cover a line; write it when the line is
  behavior that a user or another part of the application relies on.
- Coverage shows that code ran, not that a test asserted anything about it. The
  rules above still decide what a test contains.

## Enforced by lint

| Rule                      | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `testing/ui-logic-tested` | Every `*-logic.ts` and `*-plugin.ts` file in a feature's `ui/` directory has a test file beside it.                                                                                                                                                                                                                                                                                                                                              |
| `testing/logic-tests`     | A UI Logic test builds its Logic with `setupLogicTest`, uses no `vi` test doubles and no `.concurrent`, and does not import React, a renderer, or a bare test app.                                                                                                                                                                                                                                                                               |
| `testing/black-box-tests` | A black box test takes `test` from the black box fixture, and finds no element itself. A page object finds elements only by role, label, or text, and does not check. Neither imports application code, calls the backend API, answers requests, runs code in the page, reads the browser's storage, or waits for a fixed time. Both live in a `black-box-tests/` directory, and that directory holds nothing else. The build checks are exempt. |

Type checking enforces the task fields: `executeTask("create", …)` compiles
only when the state declares `createState` and `createError`.
