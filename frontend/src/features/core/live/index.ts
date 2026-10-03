import {
  createApiClient,
  type ApiClientProps,
} from "../../api/client/api-client.js";
import type { App, FrontendServices, FrontendStorage } from "../types.js";
import { EventEmitter } from "@shadow/common/features/core/events/event-emitter";
import { ConsoleLoggerService } from "@shadow/common/features/core/services/console-logger-service";
import type { LogLevel } from "@shadow/common/features/core/services/types";
import type { ApiAccessEvent } from "../../api/client/access-events.js";
import { BrowserWindowFocusService } from "../../window-focus/services/browser-window-focus-service.js";

interface LiveAppProps extends ApiClientProps {
  /** The browser console shows entries at this level and above. */
  logLevel?: LogLevel;
}

/** Compose one frontend app with live dependencies. */
export function createApp({
  logLevel = "warn",
  ...apiProps
}: LiveAppProps = {}): App {
  const storage: FrontendStorage = {};
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
