import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import type { Profile } from "@app/common/features/core/utils/profile";
import type { BackendApi } from "../api/client/api-client.js";
import type { ApiAccessEvents } from "../api/client/access-events.js";
import type { ClockServiceInterface } from "../clock/services/types.js";
import type { DialogServiceInterface } from "../dialogs/services/types.js";
import type { EntriesStorage } from "../entries/storage/entries-storage.js";
import type { PasskeyServiceInterface } from "../auth/services/types.js";
import type { SettingsStorage } from "../settings/storage/settings-storage.js";
import type { ThemeServiceInterface } from "../settings/services/types.js";
import type { WindowFocusServiceInterface } from "../window-focus/services/types.js";

export interface FrontendStorage {
  entries: EntriesStorage;
  settings: SettingsStorage;
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
  theme: ThemeServiceInterface;
  windowFocus: WindowFocusServiceInterface;
}

export interface App {
  /** The requests of `api` name this log. */
  profile: Profile;
  api: BackendApi;
  /** The same backend, with each request naming the partner log. */
  partnerApi: BackendApi;
  apiAccessEvents: ApiAccessEvents;
  storage: FrontendStorage;
  services: FrontendServices;
}
