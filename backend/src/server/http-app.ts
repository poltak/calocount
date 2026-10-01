import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireSession } from "../features/auth/handlers/require-session.js";
import type { AuthEnvironment } from "../features/auth/handlers/types.js";
import {
  handleError,
  handleNotFound,
} from "../features/core/handlers/error-responses.js";
import { createEncounterLifecycleHandlers } from "../features/encounter-lifecycle/handlers/encounter-lifecycle-handlers.js";
import type { App } from "../index.js";

interface HttpAppProps {
  app: Pick<App, "logic" | "services">;
}

/** Every business route, including future routes, shares the authentication gate. */
export function createBusinessHttpApp({ app }: HttpAppProps) {
  return new Hono<AuthEnvironment>()
    .use("*", requireSession({ services: app.services, logic: app.logic }))
    .get("/api/me", (context) => {
      const { id, email, name } = context.get("auth").user;
      return context.json({ user: { id, email, name } });
    })
    .route(
      "/encounters",
      createEncounterLifecycleHandlers({ logic: app.logic }),
    );
}

/** Auth entry points must remain reachable before a session exists. */
export function createHttpApp({ app }: HttpAppProps) {
  return new Hono()
    .use(
      "*",
      cors({
        origin: [...app.services.auth.trustedOrigins],
        credentials: true,
      }),
    )
    .all("/api/auth/*", (context) => app.services.auth.handle(context.req.raw))
    .route("/", createBusinessHttpApp({ app }))
    .onError(handleError)
    .notFound(handleNotFound);
}
