import { createApiClient } from "../api/client.js";
import type { App } from "../index.js";

interface TestAppProps {
  /** Supply an in-memory handler transport or an explicit unit-test transport. */
  fetch: typeof globalThis.fetch;
  baseUrl?: string;
}

/** Test composition never defaults to a real network request. */
export function createApp({
  fetch,
  baseUrl = "http://shadow.test",
}: TestAppProps): App {
  return {
    storage: {},
    services: {},
    api: createApiClient({ fetch, baseUrl }),
  };
}
