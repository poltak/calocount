import type { ApplyGlobalResponse } from "hono/client";
import type { createBusinessHttpApp } from "./server/http-app.js";

/** Public, type-only contract. No backend implementation runs in the browser. */
export type ApiType = ApplyGlobalResponse<
  ReturnType<typeof createBusinessHttpApp>,
  {
    401: { json: { error: { code: "UNAUTHENTICATED"; message: string } } };
    403: { json: { error: { code: "FORBIDDEN"; message: string } } };
    // Hono does not infer errors returned by a global onError handler.
    501: {
      json: { error: { code: "NOT_IMPLEMENTED"; message: string } };
    };
  }
>;
