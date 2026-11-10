import { env as globalEnvironment } from "cloudflare:workers";
import type { ExecutionContext } from "hono";
import { createApp, type WorkerEnvironment } from "../live/index.js";
import { createHttpApp } from "./http-app.js";

/**
 * One App for each isolate, made in the global scope. A new App for each
 * request would build the router, each Logic class and each Storage class
 * again. Nothing here does I/O, and the App holds only bindings and plain
 * values.
 *
 * `initializeLogic` does not run here, so no backend Logic can have a start-up
 * hook. Global scope cannot do I/O, so such a hook could not read anything.
 */
const app = createApp({
  env: globalEnvironment as unknown as WorkerEnvironment,
  // The one place in the Worker that writes to the console.
  // oxlint-disable-next-line no-console
  writeLogLine: (line) => console.log(line),
});
const httpApp = createHttpApp({
  app,
  // A Worker has no socket address to read. Cloudflare sets this header.
  clientAddressHeader: "cf-connecting-ip",
});

export default {
  fetch(request: Request, env: WorkerEnvironment, context: ExecutionContext) {
    return httpApp.fetch(request, env, context);
  },
  /** The hourly cron trigger removes expired sessions, challenges, codes and tokens. */
  async scheduled() {
    try {
      await app.logic.authConnections.cleanupExpired();
    } catch (error) {
      app.services.logger.error("Clean-up of expired sign-in data failed", {
        error,
      });
    }
  },
};
