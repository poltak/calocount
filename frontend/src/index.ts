import type { BackendApi } from "./api/client.js";
import type { FrontendAuthClient } from "./api/auth-client.js";
import type { ApiAccessEvents } from "./api/access-events.js";
import type { WindowFocusService } from "./features/window-focus/services/types.js";

export interface FrontendStorage {}

export interface FrontendServices {
  windowFocus: WindowFocusService;
}

/** Services and Storage shared by one running frontend app. */
export interface App {
  api: BackendApi;
  auth: FrontendAuthClient;
  apiAccessEvents: ApiAccessEvents;
  storage: FrontendStorage;
  services: FrontendServices;
}
