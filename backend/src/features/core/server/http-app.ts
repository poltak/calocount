import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { requireSession } from "../../auth/handlers/require-session.js";
import { requireTrustedOrigin } from "../../auth/handlers/require-trusted-origin.js";
import { createProfileHandlers } from "../../auth/handlers/profile-handlers.js";
import { createSessionHandlers } from "../../auth/handlers/session-handlers.js";
import { createSignUpHandlers } from "../../auth/handlers/sign-up-handlers.js";
import type { AuthEnvironment } from "../../auth/handlers/types.js";
import { AppError } from "../errors/app-error.js";
import { resolveClientAddress } from "../handlers/client-address.js";
import {
  createErrorHandler,
  handleNotFound,
} from "../handlers/error-responses.js";
import { logRequests } from "../handlers/request-log.js";
import type { RequestEnvironment } from "../handlers/types.js";
import { createEncounterLifecycleHandlers } from "../../encounter-lifecycle/handlers/encounter-lifecycle-handlers.js";
import { createHealthHandlers } from "../../health/handlers/health-handlers.js";
import { createNotesHandlers } from "../../notes/handlers/notes-handlers.js";
import type { App } from "../types.js";

/** The server refuses a larger request body. Raise it for a route that takes uploads. */
const MAX_REQUEST_BODY_BYTES = 100 * 1024;

interface ApiHttpAppProps {
  app: Pick<App, "logic" | "services">;
}

interface HttpAppProps extends ApiHttpAppProps {
  /** Set it only behind a proxy. See `resolveClientAddress`. */
  clientAddressHeader?: string | undefined;
}

/** Every business route, including future routes, shares the authentication gate. */
function createBusinessHttpApp({ app }: ApiHttpAppProps) {
  return new Hono<AuthEnvironment>()
    .use("*", requireSession({ services: app.services, logic: app.logic }))
    .route("/me", createProfileHandlers({ logic: app.logic }))
    .route("/notes", createNotesHandlers({ logic: app.logic }))
    .route(
      "/encounters",
      createEncounterLifecycleHandlers({ logic: app.logic }),
    );
}

/**
 * Routes under `/api`. The session and sign-up routes come first so they stay
 * reachable without a session; every other route passes the authentication
 * gate.
 */
export function createApiHttpApp({ app }: ApiHttpAppProps) {
  return new Hono()
    .use("*", requireTrustedOrigin({ services: app.services }))
    .route("/session", createSessionHandlers({ logic: app.logic }))
    .route("/sign-up", createSignUpHandlers({ logic: app.logic }))
    .route("/", createBusinessHttpApp({ app }));
}

export function createHttpApp({ app, clientAddressHeader }: HttpAppProps) {
  return (
    new Hono<RequestEnvironment>()
      .use("*", requestId())
      .use("*", secureHeaders())
      .use(
        "*",
        cors({
          origin: [...app.services.auth.trustedOrigins],
          credentials: true,
          exposeHeaders: ["X-Request-Id"],
        }),
      )
      // A host sends a probe every few seconds. The health routes come before
      // the request log, so the probes do not fill it.
      .route("/health", createHealthHandlers({ logic: app.logic }))
      .use("*", logRequests({ services: app.services }))
      .use(
        "*",
        bodyLimit({
          maxSize: MAX_REQUEST_BODY_BYTES,
          onError: () => {
            throw new AppError({
              code: "PAYLOAD_TOO_LARGE",
              message: "The request is too large",
            });
          },
        }),
      )
      .use("*", resolveClientAddress({ header: clientAddressHeader }))
      .route("/api", createApiHttpApp({ app }))
      .onError(createErrorHandler({ services: app.services }))
      .notFound(handleNotFound)
  );
}
