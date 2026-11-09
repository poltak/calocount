import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import type { BackendApi } from "../api/client/api-client.js";
import type { ApiAccessEvents } from "../api/client/access-events.js";
import type { WindowFocusServiceInterface } from "../window-focus/services/types.js";

/** The frontend Storage classes. The project has none yet. */
export type FrontendStorage = Record<string, never>;

/**
 * Core Services. Any Service, Storage, or Logic class may depend on one. See
 * docs/agents/code-architecture.md (Class roles).
 */
interface FrontendCoreServices {
  logger: LoggerServiceInterface;
}

export interface FrontendServices extends FrontendCoreServices {
  windowFocus: WindowFocusServiceInterface;
}

export interface App {
  api: BackendApi;
  apiAccessEvents: ApiAccessEvents;
  storage: FrontendStorage;
  services: FrontendServices;
}
