import { createMiddleware } from "hono/factory";

/**
 * A JSON answer holds data of one person, so no cache may keep it and no
 * crawler may index it. A route that sets its own `cache-control` keeps it.
 * Other content types, such as photos, have their own cache rules.
 */
export function privateJsonHeaders() {
  return createMiddleware(async (context, next) => {
    await next();
    const type = context.res.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("application/json")) {
      return;
    }
    if (!context.res.headers.has("cache-control")) {
      context.res.headers.set("cache-control", "no-store");
    }
    if (context.res.headers.get("cache-control") === "no-store") {
      context.res.headers.set("pragma", "no-cache");
    }
    context.res.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  });
}
