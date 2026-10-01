import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireSession } from "../features/auth/handlers/require-session.js";
import { requireTrustedOrigin } from "../features/auth/handlers/require-trusted-origin.js";
import { createSessionHandlers } from "../features/auth/handlers/session-handlers.js";
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
function createBusinessHttpApp({ app }: HttpAppProps) {
  return new Hono<AuthEnvironment>()
    .use("*", requireSession({ services: app.services, logic: app.logic }))
    .get("/me", (context) => {
      const { id, email, name } = context.get("auth").user;
      return context.json({ user: { id, email, name } });
    })
    .route(
      "/encounters",
      createEncounterLifecycleHandlers({ logic: app.logic }),
    );
}

/**
 * Routes under `/api`. Session routes come first so they stay reachable
 * without a session; every other route passes the authentication gate.
 */
export function createApiHttpApp({ app }: HttpAppProps) {
  return new Hono()
    .use("*", requireTrustedOrigin({ services: app.services }))
    .route("/session", createSessionHandlers({ logic: app.logic }))
    .route("/", createBusinessHttpApp({ app }));
}

export function createHttpApp({ app }: HttpAppProps) {
  return new Hono()
    .use(
      "*",
      cors({
        origin: [...app.services.auth.trustedOrigins],
        credentials: true,
      }),
    )
    .route("/api", createApiHttpApp({ app }))
    .onError(handleError)
    .notFound(handleNotFound);
}
