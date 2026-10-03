# Decisions

Choices specific to this project, with their reasons.
Add an entry when a choice has a reason that the code cannot show. Keep each
entry to the choice, the reason, and any rule that follows from it.

## Backend

- **Hono for HTTP routing.** Chosen for its small API and its support for Node,
  Deno, and other runtimes (avoids runtime lock-in). Register routes by chaining, because the typed client derives its endpoint types from the chained result.
- **Zod 4 with `@hono/zod-validator` for request validation.** Schemas check the
  shape of input and supply its TypeScript types. Hono by itself does not come with
  request validation.
- **Node through `@hono/node-server`.** Node is the current runtime. A Deno entry
  point could use `Deno.serve` later, for example.
- **PostgreSQL through Kysely, with PGlite in tests.** Each test app gets its
  own in-memory PostgreSQL database, so tests run real queries without a
  database server and cannot affect each other. Kysely chosen for ease of
  switching between real vs in-memory Postgres, without changing interfacing code (Storage classes).
- **A typed first-party API client instead of feature Service wrappers.** Hono's
  client derives request and response types from the backend routes through a
  type-only export. This couples builds to the contract, not browser code to the
  server implementation; another server could implement the same contract.
- **The API types stay in the backend, not in `common`.** TypeScript infers them
  from the route code, so only the backend can produce them; this is why the
  frontend has a type-only import from `backend/api`. Writing the contract by
  hand in `common` would remove that exception. Reconsider it when a second
  client or server needs the API, or when responses need runtime validation.
- **All business routes sit under `/api` behind one authentication gate.** Only
  the session routes are outside it. Add new routes inside the gated app, so a
  route cannot be exposed by omission.
- **Two health routes sit outside `/api` and need no session.** `GET /health`
  answers when the process runs. `GET /health/ready` also queries the database
  and answers 503 when it does not respond. A host uses the first to restart a
  stuck process, and the second to send traffic only to an instance that can
  serve it. The request log leaves both out, because probes arrive every few
  seconds.
- **Every response has security headers, and request bodies have a size
  limit.** Hono's `secureHeaders` sets its defaults on every response. The
  limit is 100 kB, set in `http-app.ts`, and a larger body gets
  `PAYLOAD_TOO_LARGE`. A route that takes uploads needs its own limit. A
  content security policy for the page belongs to whatever serves the page,
  which is not decided yet.
- **Logging uses no library.** The logger is a Core Service with three
  implementations: readable lines on the console, one JSON object for each
  line on standard output, and entries kept in memory for tests. `LOG_FORMAT`
  selects the first or the second, and JSON is the default so that a production
  host needs no setting. Hono's `requestId` gives each request an ID, which the
  request log and the `X-Request-Id` response header both carry. It keeps an ID
  that the caller or a proxy sent.

## Authentication

- **Better Auth, embedded in the backend behind `AuthServiceInterface`.** It is open
  source, has a native Kysely adapter, and runs against the isolated test
  database. It owns its own user, account, session, and verification tables.
- **The frontend never uses Better Auth's client.** Our own `/api/session`
  routes wrap sign-in and sign-out, so replacing Better Auth changes one backend
  Service. Its own routes are not mounted, which exposes only what we wrap.
- **Sign-in and sign-out pass through Better Auth's request handler inside the
  Service.** Its rate limits and origin checks only run on that path; calling
  its server functions directly would skip them. The Service returns only the
  session cookies, so the session token never appears in a response body.
- **Rate limits are always on, and their counts are in the database.** Better
  Auth turns them on only when `NODE_ENV` is `production`, and counts in
  process memory by default. Memory counts are separate in each server
  instance, and all tests in one worker would share them. The limit for
  sign-in is Better Auth's default: 3 attempts in 10 seconds for one caller
  address.
- **The transport decides the caller's address, not the caller.** Better Auth
  reads the address from request headers, which a caller can forge when no
  proxy is in front. A middleware takes the address from the socket, or from
  the header named in `SHADOW_CLIENT_ADDRESS_HEADER` behind a proxy. The
  Service passes it to Better Auth in a private header and removes any value
  the caller sent there. Callers without an address share one count.
- **Session cookies are `Secure` when `BETTER_AUTH_URL` is HTTPS.** Better Auth
  derives this from the base URL, so production needs no extra setting.
- **Better Auth logs through our logger.** Its own messages, such as a wrong
  password, appear in the same format as ours.
- **One owner account, created from the command line.** Registration is
  disabled. `auth:setup-owner` creates the account for `SHADOW_OWNER_EMAIL` and
  refuses to replace existing credentials. No default password exists.
- **Admission is checked on every request.** A valid session for any other email
  gets 403. Accounts and sessions stay ordinary Better Auth records, so a
  multi-user policy later needs no new auth system.
- **The server is the access boundary.** Frontend route guards only improve the
  experience; they are not a security control.
- **Requests that change state must come from a trusted origin.** CORS allows
  only the configured origins, and every `/api` mutation is checked again.
- **Auth schema migration is an explicit command.** Server startup neither
  migrates nor creates users. Review dependency upgrades before migrating a
  populated database.

## Frontend

- **React with Vite.** Chosen for a browser app beside a separate Hono API, and
  for tests that run UI, API, and database code together in a single process.
- **React Router in declarative mode.** Chosen for familiar component routes in
  a small single-page app. Live rendering uses `BrowserRouter` and tests use
  `MemoryRouter`. Framework mode and server rendering are not needed.
- **The error boundary is our own class component.** It is about 50 lines, so
  a package is not necessary. Its fallback offers "Try again", which mounts the
  failed part again from a new start. It does not reload the page, because
  only Services and `main.tsx` may use browser globals.

## Testing

- **Tests are integration tests of UI Logic against the full application.** A
  test that replaces parts of the path can pass while the real path is broken,
  so almost every test runs the whole path and replaces nothing on it. The rules
  are in [testing](testing.md).
- **Full-application tests run in one process.** One fixture creates an isolated
  backend, its HTTP app, and a frontend app. Frontend requests call the HTTP app
  directly with standard `Request` objects: no network and no listening socket,
  while validation, handlers, and error mapping still run. A test can then
  assert on UI Logic state and on database rows together.
- **Tests do not render components.** Behavior lives in UI Logic, so a rendered
  test adds little and is slower to write and to read. The one exception is the
  hook that owns a Logic's lifecycle, which exists only inside React.
- **Tests read the database with direct queries, not through Storage.** Storage
  has methods only for production paths. The operation under test already runs
  the production Storage code, and a direct query checks what it stored.
- **Every test has its own application and database,** so any test can run alone
  and test files run in parallel.
- **Each test database starts from a snapshot.** Starting an empty PGlite
  database takes about 550 ms, and hashing the owner's password takes another
  70 ms. Each test worker builds one migrated database with the owner in it,
  and every test database starts from a copy, which takes about 100 ms.
- **Logic tests run in plain Node, not a simulated browser.** They need no DOM,
  and the simulated browser adds startup time to every test file. The one
  rendered test opts into it.
- **Coverage requires only that every UI Logic function runs in a test.**
  Meeting that takes a test of each operation. We set no line or branch
  thresholds, because they reward tests written to raise a number. The same run
  reports backend coverage, also without a threshold.
- **Each simulated browser has its own cookie-aware transport,** so tests can
  hold separate sessions against one backend. The transport can also hold a
  request or fail as a lost connection, so tests reproduce timing and network
  failures without test doubles.
- **The fixture cleans up through Vitest's `onTestFinished`.** Its callbacks run
  in reverse order, so the Logic is cleaned up before the backend closes and no
  request outlives the database. This needs one test at a time within a file,
  so `it.concurrent` is not used.

## Tooling

- **pnpm runs scripts on a pinned Node version.** `devEngines.runtime` makes pnpm
  download and use the version in `.nvmrc`, whatever `node` is on the PATH.
  Agents, people, and CI therefore run the same version.
- **`pnpm run dev` runs compilers in watch mode, not a TypeScript runner.**
  Node cannot run this source directly: imports name `.js` files, and classes
  use parameter properties. So `tsc --watch` writes `dist`, and `node --watch`
  restarts the server when `dist` changes. Builds are incremental, so the watch
  build that starts after the first build writes nothing, and the server
  starts once. The Vite dev server holds each API request until the backend
  answers its health route, so a request during a restart waits and does not
  fail.
- **`pnpm run check` builds once, then runs every other step at the same time.**
  After `common` and the backend are built, no step depends on another. Each
  step is a `check:<name>` script. Every step runs to the end even when one
  fails, and the output ends with a list of the steps that failed.
- **Prettier chosen for formatting** with Agent hooks, format-on-save for popular editors,
  and pre-commit hooks set up. Main reason is for consistently formatted code for ease of reading.
- **oxlint chosen for linting.** One blank-line rule comes from the stylistic ESLint
  plugin, loaded through oxlint's JS plugin support.
- **Architecture rules are a local lint plugin, not a separate tool.** The rules
  in `lint/` use the standard ESLint rule API, so one mechanism covers imports,
  naming, and layout, each error cites the architecture document, and ESLint
  could run the same rules. Rules about technology choices sit in their own
  plugin, apart from rules about the architecture's shape. oxlint marks its JS
  plugin support as alpha, so recheck these rules when upgrading oxlint.
