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
- **One database engine for each project, chosen at the start.** Kysely gives
  portable queries, and not a portable database. Transactions, SQL dialects,
  migrations, and test databases differ between engines. So the template has
  no engine layer and no portable SQL, and each migration is in the dialect of
  the one engine. A layer would cost each project on PostgreSQL, and it would
  still leak: D1 has no interactive transaction, so `transaction()` has no
  equal there. A project on D1 sends lists of statements, and that reaches its
  Logic code, so a project cannot change engines later without a redesign. A
  project on another engine changes `core/database/`, the `transaction`
  function in `compose-app.ts`, and the test database in `core/tests/index.ts`,
  and gives `BetterAuthService` its `databaseType`. PostgreSQL stays the
  default, and a default project sets none of this.
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
- **The database uses snake_case, and TypeScript uses camelCase.** PostgreSQL
  changes a name with no quotes to lower case, so a camelCase name needs
  quotes in each SQL statement and in each database tool. One Kysely plugin,
  `DatabaseNames`, maps the names. The auth SDK uses the same query builder,
  so its tables get snake_case too, and the database has one style. The cost
  is that a column has two names: `createdAt` in TypeScript, and `created_at`
  in a migration. The plugin leaves the keys inside a JSON value as they are,
  so a stored document comes back as it went in.
- **Every application table has `id`, `createdAt`, and `updatedAt`, and three
  checks hold this.** The table types extend `BaseTable`, the `Database` type
  does not compile for a table without the columns, and one test reads the
  real schema, because the types cannot see the SQL of a migration. Tables
  that the auth SDK owns are exempt. A table that only gets new records has no
  `updatedAt`, and must be in a named list.
- **A trigger sets `updatedAt`, not the Storage code.** A Storage method cannot
  forget it, and the column's type refuses a value from code. The trigger does
  not fire when an update changes nothing. Its cost is that it also fires in a
  migration that changes many records.
- **A migration writes the standard columns as plain SQL, without a helper.**
  A helper that changes later would change what an old migration does on a new
  database, and the schema test already finds a table that is wrong.
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
- **A user ID is `text`, not `uuid`.** This keeps the schema independent of
  one auth provider. Better Auth can make UUIDs, but some providers have user
  IDs that are not UUIDs, and a `text` column accepts the IDs of all of them.
  Columns that point at a user are `text` for the same reason, while the IDs
  of our own tables are `uuid`.
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
- **Two account modes, and a project selects one with `APP_ACCOUNT_MODE`.**
  Some projects need one owner, and most need accounts for many people. Both
  modes are in the code and in the tests, so a
  project changes one setting and no code. The mode is an `AccountPolicy`
  value that the composition root gives to the auth Logic classes.
- **In single-owner mode, one account exists, created from the command
  line.** Nobody can sign up. `auth:setup-owner` creates the account for
  `APP_OWNER_EMAIL` and refuses to replace existing credentials. No default
  password exists.
- **An operator resets a lost password from the command line.**
  `auth:reset-password` sets a new password and ends each session of the
  account. The person who runs it has the server and the database, so it asks
  for no other proof, and it has no route. Without it, the only way back in is
  to delete the account, and that also deletes the records of the user. A
  reset by email needs a Service that sends email, which this repository does
  not have.
- **In open sign-up mode, a visitor makes an account at `/sign-up`.** The
  request goes through Better Auth's request handler, as sign-in does, so the
  same rate limit applies: 3 attempts in 10 seconds for one caller address.
  The new account is signed in at once.
- **Sign-up is refused in two places when the mode does not permit it.**
  `AuthSignUpLogic` decides and gives the caller the reason. Better Auth is
  also configured with sign-up off, so a defect in our code cannot open it.
- **Open sign-up mode does not verify email addresses.** A person can make an
  account with an address that is not theirs, and the sign-up page tells a
  visitor when an address has an account. A public app must add email
  verification, and a password reset that the user starts. Both need a Service
  that sends email,
  which this repository does not have. Roles are also absent: all accounts
  are equal.
- **Admission is checked on every request.** In single-owner mode, a valid
  session for any other email gets 403. The rule is one method,
  `AuthAccessLogic.isAllowed`, so a project with its own rule changes that
  method. Accounts and sessions are ordinary Better Auth records in both
  modes.
- **Each feature decides which records a user can read.** The account mode
  decides who can sign in, and nothing more. `NotesStorage` limits each query
  to the signed-in user, which is the model for records that are private to
  one user.
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
  does not get another user's draft on a shared browser.
- **Sign-out removes that text, and a session that expires does not.**
  `AuthLogic` sends a `signedOut` event, and the `NoteDraftPlugin` of the open
  page removes each draft of that user. A user who signs out on a shared
  browser then leaves no text there. A session that the backend ends sends no
  event, so the text is there after the next sign-in. This is also the example
  of one Logic that reacts to another through an event. Only a Logic on the
  open page hears the event. That is sufficient here, because each page behind
  the session gate has a note form. A project with other pages must listen in
  a Logic that lives as long as the session.
- **The error boundary is our own class component.** It is about 50 lines, so
  a package is not necessary. Its fallback offers "Try again", which mounts the
  failed part again from a new start. It does not reload the page, because
  only Services and `main.tsx` may use browser globals.

## Testing

- **Tests are integration tests of UI Logic against the full application.** A
  test that replaces parts of the path can pass while the real path is broken,
  so almost every test runs the whole path and replaces nothing on it. The rules
  are in [testing](testing.md).
- **A test on a second host is the same test type.** A Durable Object cannot
  run in the Node fixture, so a project with one needs another runtime for
  those tests. The test has the same form there, so the two test types stay
  two, and the backend still has no test runner of its own. The template has
  no second host, because a default project has no use for one.
- **Full-application tests run in one process.** One fixture creates an isolated
  backend, its HTTP app, and a frontend app. Frontend requests call the HTTP app
  directly with standard `Request` objects: no network and no listening socket,
  while validation, handlers, and error mapping still run. A test can then
  assert on UI Logic state and on database rows together.
- **Vitest tests do not render components.** Behavior lives in UI Logic, so a
  rendered test adds little and is slower to write and to read. The one
  exception is the hook that owns a Logic's lifecycle, which exists only inside
  React.
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
  database engine. The snapshot is taken after a checkpoint. Without one,
  each copy replayed the write-ahead log of the migrations when it started,
  which was about a fifth of its start time. The snapshot also has no
  `template0` and `template1` databases, because no test creates a database.
  Without them, a copy starts about a quarter faster.
- **A test that starts signed in starts from a second snapshot.** The global
  setup signs the owner in once, takes a snapshot that has the session, and
  keeps the session's cookies. Each signed-in test starts from a copy with
  those cookies and does not sign in again. The sign-in hashes the password,
  which was about a fifth of each such test. So that the cookies stay valid,
  every backend of a test run has the same auth secret. A test with
  `authenticated: false` starts from the first snapshot, which has no session.
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
- **A few build checks cover what the other tests cannot.** No other test
  loads the build output, the route table, or `main.tsx`, so an update to
  React Router or Vite could pass the check and still break the app.
  Playwright opens the built frontend and makes one visit: sign in, add a
  note, reload, change page, see both error boundaries, sign out.
- **Black box tests check stable workflows through the built app.** Agents
  write and refactor much of the code, and the UI Logic tests know the Logic
  state and the tables, so a refactor changes those tests too. A black box test
  knows only what a user sees. It stays the same through a refactor, so after
  the refactor, a pass shows that the behavior stayed the same.
- **Page objects hold what the black box tests know about each page.** A change
  to a page then changes one file, not each test that uses the page. Lint keeps
  the lookup of elements out of the test files.
- **Black box tests find elements by role and accessible name.** A change of
  style or layout then breaks no test. A missing label fails a test, as it
  fails a screen reader user. CSS selectors and test IDs are not used.
- **Each black box test has its own backend and database,** so the tests share
  no data and any test can run alone. The build has one backend address in it,
  so the tests run one at a time. Each worker builds the database template
  once, which takes more than a second, and each test starts from a copy.
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
- **CI installs the test browser without its system packages, and without a
  cache.** On the GitHub runner, `--with-deps` took 21 of the step's 26
  seconds and added only fonts, which no test needs. The download takes 4
  seconds, and a cache of that size takes as long to restore.
- **CI has no step that sets up Node, and no dependency cache.** pnpm
  downloads the pinned Node by itself, so a setup step downloaded Node a
  second time and took about 10 seconds. That step also kept the dependency
  cache. The cache gave nothing: a run with a cache hit and a run that
  downloaded each package took the same time.
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
  step is a `check:<name>` script, or `test:app` for the tests. Every step
  runs to the end even when one fails, and the output ends with a list of the
  steps that failed.
- **CI runs its jobs at the same time: the checks, four jobs of tests, and
  the browser tests with the live start.** With one job, a run took the sum of
  the three. In four pairs of runs on one commit, three jobs in place of one
  made the wait go from about 93 seconds to about 69. The tests then run in
  four jobs, because the runner of a private repository has one core with two
  threads. Vitest runs one worker there, and a second worker made Shadow's
  538 tests only 4% faster, because one worker already uses most of both
  threads. Shadow's tests took 5 minutes 48 seconds in one job, and 3 minutes
  19 seconds in three. Vitest splits the files into shards by a hash of each
  path, which put Shadow's two largest files in one shard. Each test takes
  about the same time, so `vite.config.ts` splits the files by size instead.
  A shard has only part of the coverage, so it does not check the thresholds.
  The "Test coverage" job waits for the four test jobs, merges their results,
  and checks them. The cost is more billed minutes, because each job repeats
  the setup and GitHub rounds each job up to a full minute: a run of the
  template takes 7 in place of 4, and a run of Shadow 15 in place of 10. In
  October 2026 the organization used more minutes than its free plan has,
  and paid $2.53 for the rest.
- **CI skips a draft pull request.** Its author still changes a draft, and a
  run for each push used billed minutes for results that nobody needed yet.
  The jobs run when the author marks the pull request as ready, and for each
  push after that. The "Template-owned files" check still runs for a draft.
  It takes seconds, and when a push to a draft changes an approved file from
  the template, the check must remove the approval at that push.
- **A pull request skips the tests when the same files passed before.** The
  key is a hash of each file of the checkout, without the Markdown files
  outside `frontend`, `backend`, and `common`. A
  run that passes saves an empty marker with that key in the GitHub cache,
  and the next run of the pull request looks for it. When the marker is
  there, the four test jobs, the coverage job, and the browser job skip. The
  checks job still runs, because it checks the format of Markdown files. A
  change of one character in a code file, also in a comment, makes a new
  key, so that change gets the full run. A comment can change what a check
  does, for example `@ts-expect-error` or a `v8 ignore` comment for coverage.
  A list of paths that the tests read would skip a run after a change to a
  file that someone forgot to put in the list. The full key has no such list,
  only the one exclusion, and no test, build, or live start reads a Markdown
  file outside the app folders. A Markdown file in an app folder still counts,
  because a page can import one. In Shadow, no Markdown file is in an app
  folder, so this costs no skip there. A key with no exclusion would skip 5
  of the 130 runs in place of 20, and the plan job would then cost more
  minutes than it saves. A pull request also finds the markers of `main`, so a pull request
  that changes only Markdown files skips the tests from its first run. A push
  to `main` runs every job. A second attempt of a run does not look for a
  marker, so that "Re-run all jobs" runs every job. From 16 October to 4
  November 2026, up to 20 of 130 CI runs of Shadow's pull requests had files
  that had passed before. In Shadow, the skipped jobs are 19 of the 22 billed
  minutes of a run, and in the template 6 of 10. The cost is the new plan
  job: one billed minute for each run, and about 12 seconds more before the
  tests start.
- **A script takes template changes, and a Swamp workflow runs the script.**
  An agent that followed a skill did this work before, and no two runs were
  the same. `scripts/sync-template.mjs` now has each step and each rule, and
  has tests. The workflow in `workflows/` only gives the order of its
  commands. The rules are not in Swamp models, because each Swamp command
  needs an account at swamp-club.com. CI and a person without an account can
  run a Node script, and cannot run Swamp. One step still needs judgment, a
  conflict that no rule resolves, and the script stops there.
- **In a project, a hook stops an agent's edit of a file that comes from the
  template.** `templateOwned` in `scripts/template-paths.json` lists the
  files. An edit in the project makes the next sync conflict, and the rules
  for agents and for the architecture are then different in each project.
  The list has `.oxlintrc.json` also, because it turns each lint rule on and
  sets its options, and an agent can turn off an architecture rule there. It
  also has the shared files of the test fixture. Shadow changed its copies of
  them for its own features, so each template change to them conflicted in a
  sync. A project now changes its test app in `core/tests/index.ts`, gives a
  test its inputs through `backendOptions`, and lists its PGlite extensions in
  `core/database/pglite-extensions.ts`, which it owns. The same
  `core/tests/index.ts` holds the test database and the test sign-in, so a
  project on another engine or sign-in method keeps the owned fixture. In
  Claude Code the hook asks the person. In Codex it refuses the edit, because
  Codex does not support "ask" yet. Codex reports such a hook as failed and
  makes the edit. The hook does not see a file that a shell command writes,
  so it stops a mistake and does not lock the files.
- **A CI check finds each change to those files in a pull request, and a
  maintainer approves it with a label.** The check sees what the hook does
  not, such as a file that a shell command wrote. Its trigger is
  `pull_request_target`, so it runs as it is on `main`, and an agent cannot
  make it pass with an edit of the workflow in the pull request. The
  maintainers are in a repository variable, which a pull request cannot
  change. A check for admin permission does not work, because in Shadow, the
  first project, each collaborator is an admin. The approval is a label and
  not a review, because a review event runs the workflow file of the pull
  request, which the pull request can change. A new label starts the check
  again, so the person does not have to. GitHub's code owners
  and branch protection would do the same with no script, but a private
  repository on the Free plan has neither. After a push, the check compares
  the pull request's own diff of each of those files before and after the
  push, and not the two head commits. A compare of the two head commits also
  has each change that came in from `main`. A sync almost always changes
  those files, so the label would go each time a contributor brings `main`
  into the branch.
- **A hook tells the agent when its branch is behind `main`.** In Shadow, the
  first project, a contributor's branch started from the `main` of the day
  before. Its pull request then listed a bug as open that `main` had fixed an
  hour before the branch's first commit. `AGENTS.md` asks for a fetch before
  each new branch, and the hook checks the branch at the start of each
  session, in Claude Code and in Codex. It compares with the `main` of the
  remote that the branch tracks, so a template branch in a project's
  repository compares with the template, and not with the project. A CI check
  cannot do this, because GitHub does not run it again when `main` moves, and
  the Free plan cannot require a branch to be up to date.
- **`pnpm run check` fails on a migration of a branch that changes a table that
  another migration of the branch creates.** An agent wrote a new migration
  for each step of its work, so one pull request had migrations that changed
  the tables of its own earlier migrations. The rule names that exact
  problem. A limit on the number of new files does not. Such a limit stops a
  pull request with three features, and it lets one file mix them. The check
  finds the table names in the SQL with patterns, which works because each
  migration is plain SQL. A SQL parser would be a new dependency.
- **A database keeps a hash of each migration that it ran.** Kysely records
  only the names, and does not run a migration again. So a development
  database that ran an older version of a file gives no error, and its schema
  differs from the files. The tests still pass, because each one starts from a
  new database. The hash is of the SQL that the migration sends to a driver
  that sends nothing, so a new compiler or formatter does not change it.
- **`hasDeployedDatabase` decides if a merged migration can change.** Before
  the first deploy, such a change costs only a new development database, and
  the history stays short. After it, the change never reaches the deployed
  database. The value is in a file that the check reads. When nobody sets it
  at the first deploy, the hash still stops the migration of a deployed
  database that ran an older version of a file.
- **Two models review each pull request for rules that no script can check,
  and the check fails on a finding.** In Shadow, a pull
  request wrote that its plan doc was correct where the data model doc disagreed, and
  did not correct the data model doc. No static analysis could catch this.
  In a test on Shadow's pull requests in October
  2026, Claude Opus and Codex found different problems. In the largest pull
  request, all runs together found 16 problems. Opus found 8, Codex Sol found
  7, and the two together found 12. Codex Astra found 9, but costs more. A run
  for each rule found a different set of problems, and not a larger one, for
  almost twice the price, so one run checks all the rules. The general rules come
  from the template, and each project adds its own rules in a file that it
  owns, because the needs of a review differ between projects. The models
  also read the title, the description, and the commit messages of the pull
  request, so that a rule can ask for the reason of a change there. A reason
  for each change in the documents would fill them with history. A model can
  also give up to three notes about a problem that no rule covers. Notes do
  not fail the check, so that a failed check always means a broken rule, and
  a note that comes back often can become a rule. The check fails and does
  not only comment, because a comment is easy to miss on a pull request whose
  checks pass. The trigger is
  `pull_request`, because the reviewers must read the files of the pull
  request. A pull request can then change the workflow, but that change fails
  the template-owned check.
- **Codex runs on a ChatGPT login and not on an API key.** Both models then
  run on a subscription, with no bill for each review. OpenAI's
  `codex-action` takes only an API key, so the workflow runs the Codex CLI
  itself. Codex refreshes the login about every 8 days, and the old refresh
  token then stops working. So the workflow saves the new login in the secret
  after each run, with a personal access token, and runs one Codex job at a
  time. A self-hosted runner would keep the login on its disk with no token,
  but it needs a machine.
- **A sync is a list of cherry-picks, and never a merge.** A project is
  without some of the template's files, and a person can leave one commit
  out. A merge cannot do that, and it marks each template commit as
  taken. A cherry-pick also shows one conflict with the one commit that
  caused it. Git does not record which commits a project took, so
  `template-version.json` does.
- **A sync merges `package.json` by its keys.** Git merges by lines, and the
  dependencies are one line each, in order. A template update of one
  dependency and a dependency that the project added on the next line are
  then a conflict, in each weekly update. By keys, they are changes to two
  different keys, and no conflict.
- **A sync keeps the project's lockfile when the template's change does not
  apply to it.** `pnpm install` then brings the lockfile up to date with the
  direct dependencies. The cost is that the project does not get the
  template's updates of indirect dependencies. A project with dependencies of
  its own has a different lockfile, and no merge of the two files is correct.
- **`pnpm run check` compares each pnpm version with `packageManager`.** pnpm
  runs the version in `devEngines.packageManager`. When that field was
  12.6.0 and `packageManager` was 12.8.2, people and CI ran 12.6.0, and
  nothing reported it. The check also reads the `version` input of each
  `pnpm/action-setup` step in a CI workflow. A cherry-pick can change one of several equal lines and
  report no conflict. A project took the template's three CI jobs before the
  template's pnpm update. The sync then gave the new version to one job of
  three, and the pnpm setup step failed in the other two. Only CI found it,
  because no other check reads a workflow file.
- **Swamp's telemetry is off for the repository.** `telemetryDisabled: true`
  in `.swamp.yaml` applies to each person who runs Swamp here. With telemetry
  on, Swamp sends the names of commands, workflows, and steps to
  swamp-club.com, with the key of the person's account. No part of the
  project needs that data flow, and a project with strict rules for its data
  must be able to name each flow to a third party. Swamp still contacts
  swamp-club.com to check the account.
- **The workspaces are TypeScript project references.** The frontend takes
  types from the backend and from `common` through their package `exports`,
  which point at `dist`. Without references, an editor showed false errors
  after each checkout until a build ran. With `composite` in the two libraries
  and `references` in the projects that use them, the editor's TypeScript
  server maps each `dist` declaration file to its source file. `tsc -p` still
  reads `dist`, so every script builds first, as before.
- **The Node types are a root dependency, as TypeScript is.** One declaration
  serves each workspace. When only the backend declared them, the frontend
  used a copy that it got as a peer of Vite. An update of the backend's copy
  then left the frontend with the old one, and two copies in one type check
  are an error.
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
  `unicorn/require-post-message-target-origin` is off in `workers/` only: a
  worker sends only to its page. A Service can send to a pop-up, so it gives
  a transfer list: `worker.postMessage(data, [])`.
- **Architecture rules are a local lint plugin, not a separate tool.** The rules
  in `lint/` use the standard ESLint rule API, so one mechanism covers imports,
  naming, and layout, each error cites the architecture document, and ESLint
  could run the same rules. Rules about technology choices sit in their own
  plugin, apart from rules about the architecture's shape. oxlint marks its JS
  plugin support as alpha, so recheck these rules when upgrading oxlint.
