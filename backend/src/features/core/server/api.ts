import type { ApplyGlobalResponse } from "hono/client";
import type { ApiErrorResponses } from "../handlers/error-responses.js";
import type { createApiHttpApp } from "./http-app.js";

/**
 * Public, type-only contract for routes mounted under `/api`. No backend
 * implementation runs in the browser. Hono does not infer responses from the
 * shared error handler, so its error bodies are declared for every route.
 */
export type ApiType = ApplyGlobalResponse<
  ReturnType<typeof createApiHttpApp>,
  ApiErrorResponses
>;
