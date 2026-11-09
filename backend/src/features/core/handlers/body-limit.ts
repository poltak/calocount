import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { matchedRoutes } from "hono/route";
import { findTargetHandler } from "hono/utils/handler";
import { AppError } from "../errors/app-error.js";

const routeLimits = new WeakSet<object>();

interface BodyLimitProps {
  maxBytes: number;
  /** What the user reads, such as "The file is larger than 25 MB". */
  message?: string;
}

function limitBody({
  maxBytes,
  message = "The request is too large",
}: BodyLimitProps) {
  return bodyLimit({
    maxSize: maxBytes,
    onError: () => {
      throw new AppError({ code: "PAYLOAD_TOO_LARGE", message });
    },
  });
}

/**
 * The limit of one route, in place of the default. A route takes a larger body
 * only with this, so an upload does not raise the limit of each other route:
 *
 * `.post("/import", routeBodyLimit({ maxBytes: 2_000_000 }), validator("json", schema), handler)`
 *
 * Put it before `validator()`, which reads the body. It then runs after the
 * session gate, so a caller without a session cannot make the server buffer a
 * large body.
 */
export function routeBodyLimit(props: BodyLimitProps): MiddlewareHandler {
  const limit = limitBody(props);
  routeLimits.add(limit);
  return limit;
}

/**
 * The limit of each route that has no `routeBodyLimit`. It runs before the
 * routes, so it must look ahead: with a plain `bodyLimit` here, no route can
 * take a larger body.
 */
export function defaultBodyLimit(maxBytes: number): MiddlewareHandler {
  const limit = limitBody({ maxBytes });
  return (context, next) => {
    const hasOwnLimit = matchedRoutes(context).some(({ handler }) =>
      // `route()` wraps a handler of a sub-app that has its own `onError`.
      routeLimits.has(findTargetHandler(handler)),
    );
    return hasOwnLimit ? next() : limit(context, next);
  };
}
