import type { ApplyGlobalResponse } from "hono/client";
import type { ApiErrorResponses } from "./features/core/handlers/error-responses.js";
import type { createBusinessHttpApp } from "./server/http-app.js";

/**
 * Public, type-only contract. No backend implementation runs in the browser.
 * Hono does not infer responses from the shared error handler, so its error
 * bodies are declared for every route.
 */
export type ApiType = ApplyGlobalResponse<
  ReturnType<typeof createBusinessHttpApp>,
  ApiErrorResponses
>;
