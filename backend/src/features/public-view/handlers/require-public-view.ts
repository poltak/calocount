import { createMiddleware } from "hono/factory";
import type { PublicViewEnvironment } from "../../core/handlers/types.js";
import { resolvePublicOwner } from "./public-owner.js";

/**
 * The gate of the public reads. They need no session, and they answer only
 * while the owner keeps the public view on. Each answer is `no-store`.
 */
export function requirePublicView(
  props: Parameters<typeof resolvePublicOwner>[0],
) {
  return createMiddleware<PublicViewEnvironment>(async (context, next) => {
    context.header("cache-control", "no-store");
    const owner = await resolvePublicOwner(props);
    if (!owner.ok) {
      return context.json(owner.body, owner.status);
    }
    context.set("publicOwner", {
      ownerKey: owner.ownerKey,
      timeZone: owner.timeZone,
    });
    await next();
    return undefined;
  });
}
