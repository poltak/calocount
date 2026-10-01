import { createMiddleware } from "hono/factory";
import type { BackendServices } from "../../../index.js";
import { AppError } from "../../core/errors/app-error.js";

/** Reject state-changing requests from untrusted browser origins. */
export function requireTrustedOrigin({
  services,
}: {
  services: Pick<BackendServices, "auth">;
}) {
  return createMiddleware(async (context, next) => {
    const origin = context.req.header("origin");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(context.req.method) &&
      origin &&
      !services.auth.trustedOrigins.includes(origin)
    ) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Request origin is not allowed",
      });
    }
    await next();
  });
}
