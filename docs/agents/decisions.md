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

## Authentication

- **Better Auth, embedded in the backend behind `AuthService`.** It is open
  source, has a native Kysely adapter, and runs against the isolated test
  database. It owns its own user, account, session, and verification tables.
- **The frontend never uses Better Auth's client.** Our own `/api/session`
  routes wrap sign-in and sign-out, so replacing Better Auth changes one backend
  Service. Its own routes are not mounted, which exposes only what we wrap.
- **Sign-in and sign-out pass through Better Auth's request handler inside the
  Service.** Its rate limits and origin checks only run on that path; calling
  its server functions directly would skip them. The Service returns only the
  session cookies, so the session token never appears in a response body.
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

## Testing

- **Full-application tests run in one process.** One fixture creates an isolated
  backend, its HTTP app, and a frontend app. Frontend requests call the HTTP app
  directly with standard `Request` objects: no network and no listening socket,
  while validation, handlers, and error mapping still run. A test can then
  assert on the page, on UI Logic state, and on database rows together.
- **Each simulated browser has its own cookie-aware transport,** so tests can
  hold separate sessions against one backend.
- **Unmount the UI before closing the backend** in these tests, so no request
  outlives the database.

## Tooling

- **pnpm runs scripts on a pinned Node version.** `devEngines.runtime` makes pnpm
  download and use the version in `.nvmrc`, whatever `node` is on the PATH.
  Agents, people, and CI therefore run the same version.
- **Prettier chosen for formatting** with Agent hooks, format-on-save for popular editors,
  and pre-commit hooks set up. Main reason is for consistently formatted code for ease of reading.
- **oxlint chosen for linting.** One blank-line rule comes from the stylistic ESLint
  plugin, loaded through oxlint's JS plugin support.
