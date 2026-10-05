import { createApiClient } from "../../api/client/api-client.js";
import type { App } from "../types.js";
import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { MemoryLoggerService } from "@app/common/features/core/services/memory-logger-service";
import type { ApiAccessEvent } from "../../api/client/access-events.js";
import { NotesDraftStorage } from "../../notes/storage/notes-draft-storage.js";
import { FakeWindowFocusService } from "../../window-focus/services/fake-window-focus-service.js";
import { MemoryKeyValueStore } from "./memory-key-value-store.js";

/**
 * Tests can drive fake Services, read the logged entries, and read and write
 * the browser storage directly.
 */
export interface TestApp extends App {
  browserStorage: MemoryKeyValueStore;
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
  baseUrl = "http://app.test",
}: TestAppProps): TestApp {
  const apiAccessEvents = new EventEmitter<ApiAccessEvent>();
  const browserStorage = new MemoryKeyValueStore();
  return {
    browserStorage,
    storage: {
      notesDrafts: new NotesDraftStorage({ store: browserStorage }),
    },
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
