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
- **Schema migrations are TypeScript files that run plain SQL, in one
  directory.** The schema history is one sequence for the whole database, so
  the files are in `core/database/migrations/` and not in each feature. A
  directory for each feature would still need one list for the order, and
  would have no place for a migration that changes two features' tables. Plain
  `.sql` files are not used, because `tsc` does not copy them to `dist` and
  Kysely's migrator takes modules.
- **A migration's name starts with its creation time in seconds.** Kysely's
  migrator runs migrations in name order, so a new one sorts last. Branches
  merge in any order, so the migrator may apply an older name after a newer
  one ran (`allowUnorderedMigrations`). A branch whose migration depends on
  another already contains that other migration, so this is safe.
- **The list of migrations is generated, and explicit.** A scan of `dist` at
  run time would also find the compiled file of a migration that was renamed
  or deleted, because `tsc` leaves old output in place. The create script
  writes `migrations.ts` from the directory instead.
- **Migrations only go forward.** There is no `down`. To undo a change, write a
  new migration.
- **Application tables and columns use camelCase, like Better Auth's.** One
  convention in the database needs no name mapping in Kysely. SQL must then
  quote each name.
- **Transactions start in backend Logic, and nowhere else.** The composition
  root gives Logic a `transaction` function whose callback receives every
  Storage class, bound to the transaction. One mechanism then covers a write
  to several tables of one feature and a write across features, and one
  operation never has two transactions. A Storage method cannot start one: a
  Storage instance inside a transaction cannot open a second.
- **The `activity` feature shows a write across two features.** Each change to
  a note and its activity record are one transaction in `NotesLogic`.
- **One function writes the validation messages that users see.** Zod's own
  messages are for developers. A message on each rule in each schema would be
  easy to forget. `userMessage` gives every kind of rule a sentence instead,
  and a schema overrides it for one rule when it needs to. The backend returns
  each message with its field's path, and `executeTask` puts them in
  `<name>FieldErrors`. Rules are not shared with the frontend, so a form shows
  these messages only after it sends the request.
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
  the header named in `APP_CLIENT_ADDRESS_HEADER` behind a proxy. The
  Service passes it to Better Auth in a private header and removes any value
  the caller sent there. Callers without an address share one count.
- **Session cookies are `Secure` when `BETTER_AUTH_URL` is HTTPS.** Better Auth
  derives this from the base URL, so production needs no extra setting.
- **Better Auth logs through our logger.** Its own messages, such as a wrong
  password, appear in the same format as ours.
- **One owner account, created from the command line.** Registration is
  disabled. `auth:setup-owner` creates the account for `APP_OWNER_EMAIL` and
  refuses to replace existing credentials. No default password exists.
- **Admission is checked on every request.** A valid session for any other email
  gets 403. Accounts and sessions stay ordinary Better Auth records, so a
  multi-user policy later needs no new auth system.
- **One owner is the default, and open sign-up is an addition, not a
  redesign.** The rule is one method, `AuthAccessLogic.isAllowed`. No table and
  no route depends on it. To let people sign up:
  - Make `isAllowed` return `true`, or replace it with the project's rule.
  - Add a sign-up route in the auth feature that calls
    `services.auth.createAccount`, a `signUp` operation in the frontend's
    `AuthLogic`, and a page. The sign-in route, operation, and page are the
    model, with their tests.
  - Remove `OwnerSetupLogic`, the `auth:setup-owner` command, and
    `APP_OWNER_EMAIL`, or keep them to create the first administrator.
  - Limit each feature's queries to the signed-in user, as `NotesStorage`
    does.
  - A public app must also verify each email address and offer a password
    reset. Both need a Service that sends email, which this repository does
    not have.
- **The server is the access boundary.** Frontend route guards only improve the
  experience; they are not a security control.
- **Requests that change state must come from a trusted origin.** CORS allows
  only the configured origins, and every `/api` mutation is checked again.
- **Schema migration is an explicit command.** Server startup neither migrates
  nor creates users. `db:migrate` applies Better Auth's schema changes first,
  then the application's migrations, which can refer to the auth tables.
  Review dependency upgrades before migrating a populated database.

## Frontend

- **React with Vite.** Chosen for a browser app beside a separate Hono API, and
  for tests that run UI, API, and database code together in a single process.
- **React Router in declarative mode.** Chosen for familiar component routes in
  a small single-page app. Live rendering uses `BrowserRouter` and tests use
  `MemoryRouter`. Framework mode and server rendering are not needed.
- **The notes example keeps unsaved text in `localStorage`.** `NoteDraftPlugin`
  holds the fields of a note form, and the create form and the edit form each
  own an instance. Each user and each form has a separate entry, so one user
  does not get another user's draft on a shared browser. This is an example. A
  real feature must decide if its text may stay in the browser after sign-out.
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
  database, migrating it, and hashing the owner's password takes seconds.
  Vitest's global setup builds one migrated database with the owner in it,
  once for a test run, and every test database starts from a copy. Building
  it in each test file put that time inside the limit of the file's first
  test, which then failed on a slow CI machine. The test time limit is 20
  seconds for the same reason: the first test of each file still starts the
  database engine.
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
- **A few browser tests cover what the other tests cannot.** No other test
  loads the build output, the route table, or `main.tsx`, so an update to
  React Router or Vite could pass the check and still break the app.
  Playwright opens the built frontend and makes one visit: sign in, add a
  note, reload, change page, see both error boundaries, sign out.
- **The browser tests use the test backend, not the live one.** The live
  composition root needs a PostgreSQL, real secrets, and later the real
  third-party Services. The test root needs none of these, so the tests run
  the same way on any machine. The cost is that they do not run
  `server/start.ts`, the live root, or the `pg` driver. The live start check
  covers those.
- **One check starts the live server, with no browser.** It is a script, not a
  test file, because it has one job: start the built backend against a real
  PostgreSQL and see it answer, lose its database connections, and stop. Its
  first run found that a failed connection in the pool stopped the server.
- **In a browser test, the frontend and the backend have different origins.**
  The page then calls the API across origins, which also tests the CORS
  settings, the trusted origin check, the cookie across origins, and the base
  URL. A setup with one origin tests none of these. That build is in
  `frontend/.browser-test/`, apart from the build in `frontend/dist`.

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
- **Development uses an embedded PostgreSQL from the `embedded-postgres`
  package.** It needs no setup on a new machine, its version is pinned in
  `package.json`, and its data is in the checkout, so each Git worktree has
  its own database. Docker is not used, because it is slow on the team's Macs.
  PGlite is not used, because the tests already run on it, and development is
  the only place where the `pg` driver runs before production. The costs: all
  releases of the package are marked beta, its binaries come from a
  third-party build, and it needs an install script, which
  `pnpm-workspace.yaml` allows for four platforms.
- **`pnpm run check` builds once, then runs every other step at the same time.**
  After `common` and the backend are built, no step depends on another. Each
  step is a `check:<name>` script. Every step runs to the end even when one
  fails, and the output ends with a list of the steps that failed.
- **The workspaces are TypeScript project references.** The frontend takes
  types from the backend and from `common` through their package `exports`,
  which point at `dist`. Without references, an editor showed false errors
  after each checkout until a build ran. With `composite` in the two libraries
  and `references` in the projects that use them, the editor's TypeScript
  server maps each `dist` declaration file to its source file. `tsc -p` still
  reads `dist`, so every script builds first, as before.
- **Three TypeScript checks are on in addition to `strict`.** They are cheap
  while the code is small, and each one finds a real class of defect.
  - `noUncheckedIndexedAccess`: a value read by index or by key can be
    `undefined`, so the code must handle a missing item.
  - `noImplicitOverride`: a method that replaces a base class method, such as
    `onInitialize`, needs `override`. A change to the base method's name is
    then an error and not a method that never runs.
  - `exactOptionalPropertyTypes`: `name?: string` means the property can be
    absent, not that it can hold `undefined`. When a caller passes a value
    through that can be `undefined`, declare `name?: string | undefined`.
- **No code uses the `any` type.** `strict` rejects an `any` that TypeScript
  would infer, and the lint rule `typescript/no-explicit-any` rejects one that
  code writes. Use `unknown` and narrow it. An `any` that comes out of a
  library, such as the result of `JSON.parse`, is not rejected: the rules for
  that need type-aware linting, which is not set up.
- **The project's name is in three locations.** They are `APP_NAME` in
  `common/src/features/core/utils/app-name.ts` for the name that users read,
  `name` in the root `package.json`, and the database name in `.env.example`.
  Everything else uses a neutral name: the `@app` package scope, the `APP_`
  prefix of environment variables, and the `app.test` host in tests. A project
  made from this repository then changes three lines, and a later change can
  move between the two repositories without a conflict on the name.
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
