import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import type { BackendApi } from "../api/client/api-client.js";
import type { ApiAccessEvents } from "../api/client/access-events.js";
import type { ClockServiceInterface } from "../clock/services/types.js";
import type { DialogServiceInterface } from "../dialogs/services/types.js";
import type { EntriesStorage } from "../entries/storage/entries-storage.js";
import type { PasskeyServiceInterface } from "../auth/services/types.js";
import type { WindowFocusServiceInterface } from "../window-focus/services/types.js";

export interface FrontendStorage {
  entries: EntriesStorage;
}

/**
 * Core Services. Any Service, Storage, or Logic class may depend on one. See
 * docs/agents/code-architecture.md (Class roles).
 */
interface FrontendCoreServices {
  logger: LoggerServiceInterface;
}

export interface FrontendServices extends FrontendCoreServices {
  clock: ClockServiceInterface;
  dialogs: DialogServiceInterface;
  passkeys: PasskeyServiceInterface;
  windowFocus: WindowFocusServiceInterface;
}

export interface App {
  api: BackendApi;
  apiAccessEvents: ApiAccessEvents;
  storage: FrontendStorage;
  services: FrontendServices;
}
