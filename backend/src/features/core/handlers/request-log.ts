import { createMiddleware } from "hono/factory";
import type { BackendServices } from "../types.js";
import type { RequestEnvironment } from "./types.js";

/**
 * Log one entry for each request after its response is ready. The path has no
 * query string, so values in a query never reach the log.
 */
export function logRequests({
  services,
}: {
  services: Pick<BackendServices, "logger">;
}) {
  return createMiddleware<RequestEnvironment>(async (context, next) => {
    const startedAt = performance.now();
    await next();
    services.logger.info("Request handled", {
      requestId: context.get("requestId"),
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
  });
}
