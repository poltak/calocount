# Testing

Read this before writing or changing a test. For the step-by-step workflow, use
the `write-integration-test` skill.

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
are covered through these tests.

## Rules

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
| `transport`                                              | Controls for the requests the frontend sends. See below.                                                    |

The owner is signed in unless the test passes `authenticated: false`.

The backend runs in single-owner mode unless the test passes
`accountMode: "openSignUp"`. In that mode a visitor can sign up, and the owner
is one user among others. The sign-up tests in `auth-logic.test.ts` use it.

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
- `use-logic.test.tsx` is the only rendered test, because the hook's lifecycle
  exists only inside React. Do not add other rendered tests; UI components
  hold no logic of their own.
- `backend-http.test.ts` covers backend behavior that no UI Logic reaches: the
  health routes, the security headers, the request ID and request log, the
  request size limit, and the answer to an unexpected error. It sends requests
  through the fixture's transport, so the whole backend still runs. Add a test
  there only for behavior of the HTTP app itself. A route that a UI Logic calls
  gets its tests through that Logic.
- `database-schema.test.ts` reads the schema that the migrations made, and
  checks that every application table has the standard columns and the
  `updatedAt` trigger. Its failure message names the table and what it needs.

## Browser tests

`pnpm run test:browser` opens the built frontend in a real browser, with
Playwright. The tests are the `*.spec.ts` files in
[`frontend/src/features/core/tests/browser/`](../../frontend/src/features/core/tests/browser/).
Before the first run, `pnpm run test:browser:install` downloads the browser.

They cover what only a real browser can show:

- The build output loads and starts, and React Router changes pages.
- The browser stores the session cookie from an API on another origin and
  sends it again, and the client joins the configured base URL correctly.
- The two error boundaries show their fallbacks and recover.

They do not cover behavior. A UI Logic test does that, with the database
assertions that a browser test cannot make. Add a browser test only for
something that no UI Logic test can reach.

How they run:

- The frontend is built with `VITE_API_BASE_URL` set and served as static
  files on one origin. The test backend listens on another origin. It is the
  same backend as in the UI Logic tests, with an in-memory database and fake
  Services for third-party systems, so a run needs no database and no secrets.
- One backend with one database serves the whole run. The tests in a file
  therefore run in order, share one page, and each starts where the test
  before it ended.
- A test may answer a request itself with `page.route`, but only to produce an
  answer that the real backend never sends, such as the malformed data that
  makes a component throw.

`pnpm run check` does not run them. CI runs them after the check, on every
push. Run them yourself after a change to `routes.tsx`, `main.tsx`,
`vite.config.ts`, the API client's request options, or an error boundary.

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
the backend as well as the frontend.

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

| Rule                      | What it checks                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `testing/ui-logic-tested` | Every `*-logic.ts` and `*-plugin.ts` file in a feature's `ui/` directory has a test file beside it.                                                                |
| `testing/logic-tests`     | A UI Logic test builds its Logic with `setupLogicTest`, uses no `vi` test doubles and no `.concurrent`, and does not import React, a renderer, or a bare test app. |

Type checking enforces the task fields: `executeTask("create", …)` compiles
only when the state declares `createState` and `createError`.
