# Technology choices

- **Hono:** HTTP routing and middleware. Chosen for its small API and support for Node, Deno, and other runtimes. Keep route definitions separate from runtime startup.
- **Zod 4:** Chosen to supply schema validation for Hono. It also derives TypeScript types from schemas. Use schemas for input checks; keep rules that depend on application state in Logic classes.
- **`@hono/zod-validator`:** Connects Zod schemas to Hono handlers and supplies validated, typed input.
- **`@hono/node-server`:** Starts Hono on Node, our current runtime. A future Deno entry point can use `Deno.serve`; database dependencies and tooling still need compatibility checks.
- **App setup:** Create one business App at server startup. `createApp()` constructs Storage, Services, and Logic instances. Handlers call `app.logic`; shutdown cleans up Logic before the database.
- **Better Auth:** embedded, open-source authentication with a native Kysely adapter and typed browser client. It fits Hono's Request/Response transport and isolated PGlite tests. `BetterAuthService` contains SDK access behind the `AuthService` interface; its internal auth tables are the framework-owned persistence exception.
- **React + Vite:** Browser UI and frontend build tooling. Chosen for the separate Hono API and tests that run UI, API, and database code together. SSR is possible, but is not a current requirement.
- **Frontend App setup:** Construct `api`, the native Better Auth `auth` client, Storage, and Services once per app. Components and providers own their UI Logic through hooks. The auth SDK client talks to our embedded backend auth endpoints; it is a first-party client. Keep React integration in the frontend workspace.
- **First-party API:** Hono's typed client exposes backend routes as `app.api`, without feature Service wrappers. Route types are shared through a type-only backend export. Services remain the place for external integrations. Type sharing couples builds to the contract, not browser runtime code to the server implementation; another server can implement the same HTTP contract.
- **In-memory transport:** tests call Hono directly with standard Request/Response objects. This removes network overhead while retaining validation and handlers. Direct Logic calls remain useful for unit tests.
- **Frontend tests:** Vitest, React Testing Library, and jsdom for component interactions and Logic lifecycle checks. Reuse the root linter and Prettier.
- **React Router:** Declarative mode for browser navigation. Chosen for familiar component routes and the current small SPA. `BrowserRouter` is used live and `MemoryRouter` in tests; framework mode and a separate server-rendering stack are not required.

References: [Hono runtimes](https://hono.dev/docs), [Hono validation](https://hono.dev/docs/guides/validation), [Hono RPC](https://hono.dev/docs/guides/rpc), [Zod](https://zod.dev), [React Router](https://reactrouter.com/start/declarative/installation).
