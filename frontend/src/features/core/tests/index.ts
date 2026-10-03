import { createApiClient } from "../../api/client/api-client.js";
import type { App } from "../types.js";
import { EventEmitter } from "@shadow/common/features/core/events/event-emitter";
import { MemoryLoggerService } from "@shadow/common/features/core/services/memory-logger-service";
import type { ApiAccessEvent } from "../../api/client/access-events.js";
import { FakeWindowFocusService } from "../../window-focus/services/fake-window-focus-service.js";

/** Tests can drive fake Services and read the logged entries directly. */
export interface TestApp extends App {
  services: {
    logger: MemoryLoggerService;
    windowFocus: FakeWindowFocusService;
  };
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
    services: {
      logger: new MemoryLoggerService(),
      windowFocus: new FakeWindowFocusService(),
    },
    apiAccessEvents,
    api: createApiClient({
      fetch,
      baseUrl,
      onSessionRejected: () =>
        apiAccessEvents.emitDetached({ type: "sessionRejected" }),
    }),
  };
}
