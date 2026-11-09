import { createMiddleware } from "hono/factory";
import type { BackendLogic, BackendServices } from "../../core/types.js";
import { AppError } from "../../core/errors/app-error.js";
import type { AuthEnvironment } from "./types.js";

export function requireSession({
  services,
  logic,
}: {
  services: Pick<BackendServices, "auth">;
  logic: Pick<BackendLogic, "authAccess">;
}) {
  return createMiddleware<AuthEnvironment>(async (context, next) => {
    const auth = await services.auth.getSession({
      headers: context.req.raw.headers,
    });
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
