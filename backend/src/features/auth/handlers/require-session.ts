import { createMiddleware } from "hono/factory";
import type { BackendLogic, BackendServices } from "../../../index.js";
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
      return context.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to continue" } },
        401,
      );
    }

    if (!logic.authAccess.isAllowed({ user: auth.user })) {
      return context.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "This account cannot access Shadow",
          },
        },
        403,
      );
    }

    // Better Auth checks origins on its own endpoints. Protect our mutations too.
    const origin = context.req.header("origin");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(context.req.method) &&
      origin &&
      !services.auth.trustedOrigins.includes(origin)
    ) {
      return context.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Request origin is not allowed",
          },
        },
        403,
      );
    }
    context.set("auth", auth);
    await next();
  });
}
