import { createMiddleware } from "hono/factory";
import { AppError } from "../../core/errors/app-error.js";
import type { BackendLogic, BackendServices } from "../../core/types.js";
import { readSessionToken } from "./session-cookies.js";
import type { AuthEnvironment } from "./types.js";

/**
 * Read the session of the cookie, and refuse nobody. A route that needs the
 * session uses `requireSession` after this.
 */
export function resolveSession({
  services,
  logic,
}: {
  services: Pick<BackendServices, "logger">;
  logic: Pick<BackendLogic, "authSession">;
}) {
  return createMiddleware<AuthEnvironment>(async (context, next) => {
    const token = readSessionToken({ request: context.req.raw });
    context.set("sessionToken", token);
    let session = null;
    if (token) {
      try {
        session = await logic.authSession.authenticate({ token });
      } catch (error) {
        // This gate has no answer, so it must not refuse the caller. A 401 here
        // signs the user out during a database fault.
        services.logger.error("Session check failed", {
          requestId: context.get("requestId"),
          error,
        });
        throw new AppError({
          code: "UNAVAILABLE",
          message: "The service is not available. Try again later.",
          cause: error,
        });
      }
    }
    context.set("session", session);
    await next();
  });
}
