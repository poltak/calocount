import { createMiddleware } from "hono/factory";
import { AppError } from "../../core/errors/app-error.js";
import type { AuthSession } from "../types.js";
import type { AuthEnvironment } from "./types.js";

/**
 * Refuse a request that has no live session. Put it after `resolveSession`.
 * The handlers after it read `session` as an `AuthSession`.
 */
export function requireSession() {
  return createMiddleware<{ Variables: { session: AuthSession } }>(
    async (context, next) => {
      // `resolveSession` stored `null` for a request with no live session.
      const session: AuthEnvironment["Variables"]["session"] =
        context.get("session");
      if (!session) {
        throw new AppError({
          code: "UNAUTHENTICATED",
          message: "Sign in to continue.",
        });
      }
      await next();
    },
  );
}
