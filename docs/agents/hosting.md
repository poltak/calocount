# Hosting

The default host is a long-lived Node process. `core/server/start.ts` starts
it, and `core/live/index.ts` is its root. Read this document before you add
another host, or before you run more than one instance.

A long-lived server hides some assumptions. A Worker, a container that scales
to zero, and a deploy with many instances each break a different one. Hono
makes the routes portable, and nothing more. So each host has its own root
file, which follows the rules below. A Worker does not use `live/index.ts`, so
its bundle has no `pg`.

## What a root must do

1. **Build one App for each process or isolate, never one for each request.** A
   new App builds the router, each Logic and Storage class, and the auth SDK
   again.
2. **Read the environment once, then build the App, then initialize Logic.**
   Give `readLiveConfig` the environment of the host, such as `env` on a Worker.
   A setting of one engine or one host stays out of that schema, as
   `DATABASE_URL` does. On a host with no start step, the first request builds
   the App, and `initializeLogic` has no place to run. Backend Logic on such a
   host has no start-up work.
3. **Treat Logic state as a cache, never as the source of truth.** Each Logic
   instance is one of many. A value that each instance must see goes in the
   database. A timer in Logic runs once for each instance.
4. **Use the host's hook for work that outlives the response.** On a Worker this
   is `ctx.waitUntil`. The host can cancel other work when the response ends,
   with no error. `emitDetached` does not keep the work alive.
5. **Do not depend on `close()`.** An isolate ends with no signal, so no data may
   wait for a shutdown.
6. **Keep a socket out of module scope on an isolate host.** A connection can
   belong to one request. A client that holds no socket, such as a D1 binding,
   can live for the whole isolate.

## What is tied to Node

These files have a tie to Node. The rest of the request path has none:
`compose-app.ts`, `http-app.ts`, the handlers, Logic, and Storage. The operator
commands in the `scripts/` folders run on Node on each host.

| File                                   | Tie                                              | On another host                                                                                                    |
| -------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `core/server/start.ts`                 | `@hono/node-server`, process signals             | The host has its own entry file                                                                                    |
| `core/live/index.ts`                   | The `pg` pool, `DATABASE_URL`                    | The host has its own root                                                                                          |
| `core/services/json-logger-service.ts` | `process.stdout.write`                           | Workers prefix each line with `stdout:`, so a log tool does not read it as JSON. Use a logger that calls `console` |
| `core/live/config.ts`                  | `process.env`, as a default argument             | Give the parser the environment of the host                                                                        |
| `core/handlers/client-address.ts`      | The address of the socket                        | Set `APP_CLIENT_ADDRESS_HEADER`                                                                                    |
| `core/database/migration-hashes.ts`    | `node:crypto`                                    | Workers need `nodejs_compat`                                                                                       |
| `core/tests/api.ts`                    | `@hono/node-server`, in `startTestBackendServer` | Tests stay on Node, or [run on a second host](testing.md)                                                          |
| `scripts/check-live-start.mjs`         | Starts `server/start.js`                         | Replace the script. CI calls `test:live-start` by name, and no list owns the script                                |

## Settings for Cloudflare Workers

A throwaway Worker ran the backend on Wrangler 4.152.0 and local `workerd` in
November 2026, with the first two settings below. No project runs these
settings from the template yet.

- Set `compatibility_flags` to `["nodejs_compat"]`. The auth SDK uses
  `AsyncLocalStorage`.
- Set `APP_CLIENT_ADDRESS_HEADER=cf-connecting-ip`. A Worker has no socket
  address to read.
- Set `advanced.database.validateSchema` to `false` in the options of the auth
  SDK. The SDK keeps one promise for its schema check, and a request can wait
  on the promise of another request, whose work stops when it ends. This comes
  from the source of better-auth 1.7.14, and no run showed the failure.
- Measure a password sign-in before a production release. The SDK's password
  hash took about 68 ms of CPU on a laptop, and the Free plan gives each request
  10 ms.
- Do not point a monitor at `/health/ready` on a database that bills for its
  use. Each call runs a query, and on a database that scales to zero it keeps
  the database awake.
