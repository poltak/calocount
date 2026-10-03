import {
  createApiClient,
  type ApiClientProps,
} from "../../api/client/api-client.js";
import type { App, FrontendServices, FrontendStorage } from "../types.js";
import { EventEmitter } from "@shadow/common/features/core/events/event-emitter";
import { ConsoleLoggerService } from "@shadow/common/features/core/services/console-logger-service";
import type { LogLevel } from "@shadow/common/features/core/services/types";
import type { ApiAccessEvent } from "../../api/client/access-events.js";
import { NotesDraftStorage } from "../../notes/storage/notes-draft-storage.js";
import { BrowserWindowFocusService } from "../../window-focus/services/browser-window-focus-service.js";
import type { BrowserKeyValueStore } from "../storage/types.js";

interface LiveAppProps extends ApiClientProps {
  /** The browser's `localStorage`. Only `main.tsx` may name that global. */
  browserStorage: BrowserKeyValueStore;
  /** The browser console shows entries at this level and above. */
  logLevel?: LogLevel;
}

/** Compose one frontend app with live dependencies. */
export function createApp({
  browserStorage,
  logLevel = "warn",
  ...apiProps
}: LiveAppProps): App {
  const storage: FrontendStorage = {
    notesDrafts: new NotesDraftStorage({ store: browserStorage }),
  };
  const services: FrontendServices = {
    logger: new ConsoleLoggerService({ minLevel: logLevel }),
    windowFocus: new BrowserWindowFocusService(),
  };

  const apiAccessEvents = new EventEmitter<ApiAccessEvent>();
  return {
    storage,
    services,
    apiAccessEvents,
    api: createApiClient({
      ...apiProps,
      onSessionRejected: () =>
        apiAccessEvents.emitDetached({ type: "sessionRejected" }),
    }),
  };
}
