import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { requireSession } from "../../auth/handlers/require-session.js";
import { requireTrustedOrigin } from "../../auth/handlers/require-trusted-origin.js";
import { createProfileHandlers } from "../../auth/handlers/profile-handlers.js";
import { createSessionHandlers } from "../../auth/handlers/session-handlers.js";
import type { AuthEnvironment } from "../../auth/handlers/types.js";
import {
  createErrorHandler,
  handleNotFound,
} from "../handlers/error-responses.js";
import { logRequests } from "../handlers/request-log.js";
import type { RequestEnvironment } from "../handlers/types.js";
import { createEncounterLifecycleHandlers } from "../../encounter-lifecycle/handlers/encounter-lifecycle-handlers.js";
import type { App } from "../types.js";

interface HttpAppProps {
  app: Pick<App, "logic" | "services">;
}

/** Every business route, including future routes, shares the authentication gate. */
function createBusinessHttpApp({ app }: HttpAppProps) {
  return new Hono<AuthEnvironment>()
    .use("*", requireSession({ services: app.services, logic: app.logic }))
    .route("/me", createProfileHandlers({ logic: app.logic }))
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
  return new Hono<RequestEnvironment>()
    .use("*", requestId())
    .use(
      "*",
      cors({
        origin: [...app.services.auth.trustedOrigins],
        credentials: true,
        exposeHeaders: ["X-Request-Id"],
      }),
    )
    .use("*", logRequests({ services: app.services }))
    .route("/api", createApiHttpApp({ app }))
    .onError(createErrorHandler({ services: app.services }))
    .notFound(handleNotFound);
}
