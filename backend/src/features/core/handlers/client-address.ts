import type { HttpBindings } from "@hono/node-server";
import { createMiddleware } from "hono/factory";
import type { RequestEnvironment } from "./types.js";

/**
 * Store the caller's network address for later handlers.
 *
 * Without a proxy, the address is the socket's. Behind a proxy the socket
 * holds the proxy's address, so `header` names the request header in which
 * the proxy reports the caller. When that header lists several addresses, the
 * last one counts: the nearest proxy added it, and a caller can forge the
 * others.
 */
export function resolveClientAddress({ header }: { header?: string }) {
  return createMiddleware<RequestEnvironment>(async (context, next) => {
    // A request that a test sends in process has no socket and no bindings.
    const bindings = context.env as Partial<HttpBindings> | undefined;
    context.set(
      "clientAddress",
      header
        ? context.req.header(header)?.split(",").at(-1)?.trim() || undefined
        : bindings?.incoming?.socket.remoteAddress,
    );
    await next();
  });
}
