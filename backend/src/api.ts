import type { ApplyGlobalResponse } from "hono/client";
import type { createHttpApp } from "./server/http-app.js";

/** Public, type-only contract. No backend implementation runs in the browser. */
export type ApiType = ApplyGlobalResponse<
  ReturnType<typeof createHttpApp>,
  {
    // Hono does not infer errors returned by a global onError handler.
    501: {
      json: { error: { code: "NOT_IMPLEMENTED"; message: string } };
    };
  }
>;
