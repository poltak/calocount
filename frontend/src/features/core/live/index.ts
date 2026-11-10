import {
  createApiClient,
  type ApiClientProps,
} from "../../api/client/api-client.js";
import type { App, FrontendServices, FrontendStorage } from "../types.js";
import type { BrowserKeyValueStore } from "../storage/types.js";
import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { ConsoleLoggerService } from "@app/common/features/core/services/console-logger-service";
import type { LogLevel } from "@app/common/features/core/services/types";
import type { ApiAccessEvent } from "../../api/client/access-events.js";
import { BrowserDialogService } from "../../dialogs/services/browser-dialog-service.js";
import { BrowserClockService } from "../../clock/services/browser-clock-service.js";
import { BrowserThemeService } from "../../settings/services/browser-theme-service.js";
import { SettingsStorage } from "../../settings/storage/settings-storage.js";
import { EntriesStorage } from "../../entries/storage/entries-storage.js";
import { BrowserPasskeyService } from "../../auth/services/browser-passkey-service.js";
import { BrowserWindowFocusService } from "../../window-focus/services/browser-window-focus-service.js";

interface LiveAppProps extends ApiClientProps {
  logLevel?: LogLevel;
  /** The browser's `localStorage`, which `main.tsx` gives. */
  browserStorage: BrowserKeyValueStore;
}

export function createApp({
  logLevel = "warn",
  browserStorage,
  ...apiProps
}: LiveAppProps): App {
  const storage: FrontendStorage = {
    entries: new EntriesStorage({ store: browserStorage }),
    settings: new SettingsStorage({ store: browserStorage }),
  };
  const services: FrontendServices = {
    logger: new ConsoleLoggerService({ minLevel: logLevel }),
    clock: new BrowserClockService(),
    dialogs: new BrowserDialogService(),
    passkeys: new BrowserPasskeyService(),
    theme: new BrowserThemeService(),
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
