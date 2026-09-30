# Full application test plan

Status: first fixture and example test implemented.

- **Goal:** drive UI interactions and assert DOM content, frontend Logic state, and backend database state in one test fixture.
- **Fixture:** [`createFullApplication`](../../frontend/tests/fixtures/full-application.ts) creates an isolated backend, its Hono app, and a frontend App in one process. PGlite supplies an in-memory database. Future external integrations can use fake Services.
- **API transport:** inject the backend's fetch-compatible function into `app.api`. It builds a standard `Request` and calls Hono directly. No network connection or listening server is used. Validation, handlers, and error mapping remain part of the test path.
- **Direct Logic calls:** avoid bypassing handlers in full-app tests: that would skip validation and transport contracts. Unit tests can call Logic methods directly. The injected transport leaves room for a different adapter if a later need justifies it.
- **UI environment:** React Testing Library mounts the routes with `MemoryRouter` in jsdom. The [example test](../../frontend/tests/full-application.test.tsx) asserts DOM content, UI Logic state, and a database row. It replaces the unfinished encounter start method with a test implementation; it does not prove real encounter behavior yet.
- **Lifecycle:** initialize backend Logic, mount the UI, then unmount before closing the backend and database. Each fixture has separate instances; the example also checks database isolation.
- **Browser checks:** add a smaller set of real-browser tests for layout, navigation, and browser-specific behavior. The backend can remain in the test runner process; the browser runs separately.
- **Next step:** use the real encounter Logic and Storage when those methods are implemented. Add browser automation for deployed routing and layout as the UI grows.
