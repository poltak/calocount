import { createMiddleware } from "hono/factory";
import { AppError } from "../../core/errors/app-error.js";
import type { AppConfig } from "../../core/types.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * A request that changes data with the session cookie must come from a page of
 * this site. SameSite=Lax already stops most cross-site requests. This check
 * also stops the ones that a browser sends from a sibling subdomain. Only a
 * test backend behind a frontend on another origin has trusted origins.
 */
export function requireTrustedOrigin({
  config,
}: {
  config: Pick<AppConfig, "trustedOrigins">;
}) {
  return createMiddleware(async (context, next) => {
    if (UNSAFE_METHODS.has(context.req.method)) {
      const origin = context.req.header("origin");
      const allowed =
        origin !== undefined &&
        (origin === new URL(context.req.url).origin ||
          config.trustedOrigins.includes(origin));
      if (!allowed) {
        throw new AppError({
          code: "FORBIDDEN",
          message: "The request must come from this site.",
        });
      }
    }
    await next();
  });
}
