# Technology choices

- **Hono:** HTTP routing and middleware. Chosen for its small API and support for Node, Deno, and other runtimes. Keep route definitions separate from runtime startup.
- **Zod 4:** Chosen to supply schema validation for Hono. It also derives TypeScript types from schemas. Use schemas for input checks; keep rules that depend on application state in Logic classes.
- **`@hono/zod-validator`:** Connects Zod schemas to Hono handlers and supplies validated, typed input.
- **`@hono/node-server`:** Starts Hono on Node, our current runtime. A future Deno entry point can use `Deno.serve`; database dependencies and tooling still need compatibility checks.
- **App setup:** Create one business App at server startup. `createApp()` constructs Storage, Services, and Logic instances. Handlers call `app.logic`; shutdown cleans up Logic before the database.

References: [Hono runtimes](https://hono.dev/docs), [Hono validation](https://hono.dev/docs/guides/validation), [Zod](https://zod.dev).
