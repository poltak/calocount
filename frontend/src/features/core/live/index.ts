import {
  createApiClient,
  type ApiClientProps,
} from "../../api/client/api-client.js";
import type { App, FrontendServices, FrontendStorage } from "../types.js";
import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { ConsoleLoggerService } from "@app/common/features/core/services/console-logger-service";
import type { LogLevel } from "@app/common/features/core/services/types";
import type { ApiAccessEvent } from "../../api/client/access-events.js";
import { BrowserPasskeyService } from "../../auth/services/browser-passkey-service.js";
import { BrowserWindowFocusService } from "../../window-focus/services/browser-window-focus-service.js";

interface LiveAppProps extends ApiClientProps {
  logLevel?: LogLevel;
}

export function createApp({
  logLevel = "warn",
  ...apiProps
}: LiveAppProps): App {
  const storage: FrontendStorage = {};
  const services: FrontendServices = {
    logger: new ConsoleLoggerService({ minLevel: logLevel }),
    passkeys: new BrowserPasskeyService(),
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
