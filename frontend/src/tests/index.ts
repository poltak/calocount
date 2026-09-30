import { createApiClient } from "../api/client.js";
import type { App } from "../index.js";
import { EventEmitter } from "@shadow/common/features/core/events/event-emitter";
import { createFrontendAuthClient } from "../api/auth-client.js";
import type { ApiAccessEvent } from "../api/access-events.js";

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
  const apiAccessEvents = new EventEmitter<ApiAccessEvent>();
  return {
    storage: {},
    services: {},
    apiAccessEvents,
    auth: createFrontendAuthClient({ fetch, baseUrl }),
    api: createApiClient({
      fetch,
      baseUrl,
      onSessionRejected: () =>
        apiAccessEvents.emitDetached({ type: "sessionRejected" }),
    }),
  };
}
