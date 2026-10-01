import { createApiClient } from "../api/client.js";
import type { App } from "../index.js";
import { EventEmitter } from "@shadow/common/features/core/events/event-emitter";
import type { ApiAccessEvent } from "../api/access-events.js";
import { FakeWindowFocusService } from "../features/window-focus/services/fake-window-focus-service.js";

/** Tests can drive fake Services directly. */
export interface TestApp extends App {
  services: { windowFocus: FakeWindowFocusService };
}

interface TestAppProps {
  /** Supply an in-memory handler transport or an explicit unit-test transport. */
  fetch: typeof globalThis.fetch;
  baseUrl?: string;
}

/** Test composition never defaults to a real network request. */
export function createApp({
  fetch,
  baseUrl = "http://shadow.test",
}: TestAppProps): TestApp {
  const apiAccessEvents = new EventEmitter<ApiAccessEvent>();
  return {
    storage: {},
    services: { windowFocus: new FakeWindowFocusService() },
    apiAccessEvents,
    api: createApiClient({
      fetch,
      baseUrl,
      onSessionRejected: () =>
        apiAccessEvents.emitDetached({ type: "sessionRejected" }),
    }),
  };
}
