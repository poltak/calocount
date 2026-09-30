import { createAuthClient } from "better-auth/client";
import type { ApiClientProps } from "./client.js";

/** Native client for this backend's embedded auth endpoints. */
export function createFrontendAuthClient({
  baseUrl,
  fetch,
}: ApiClientProps = {}) {
  return createAuthClient({
    baseURL: baseUrl || undefined,
    fetchOptions: {
      credentials: "include",
      customFetchImpl: fetch ?? globalThis.fetch.bind(globalThis),
    },
  });
}
export type FrontendAuthClient = ReturnType<typeof createFrontendAuthClient>;
