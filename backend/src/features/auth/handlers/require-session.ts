import { createMiddleware } from "hono/factory";
import type { BackendLogic, BackendServices } from "../../core/types.js";
import { AppError } from "../../core/errors/app-error.js";
import type { AuthSession } from "../services/types.js";
import type { AuthEnvironment } from "./types.js";

export function requireSession({
  services,
  logic,
}: {
  services: Pick<BackendServices, "auth" | "logger">;
  logic: Pick<BackendLogic, "authAccess">;
}) {
  return createMiddleware<AuthEnvironment>(async (context, next) => {
    let auth: AuthSession | null;
    try {
      auth = await services.auth.getSession({
        headers: context.req.raw.headers,
      });
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
    if (!auth) {
      throw new AppError({
        code: "UNAUTHENTICATED",
        message: "Sign in to continue",
      });
    }

    if (!logic.authAccess.isAllowed({ user: auth.user })) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "This account does not have access",
      });
    }

    context.set("auth", auth);
    await next();
  });
}
