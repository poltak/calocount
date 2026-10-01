import type { BackendApi } from "../api/client/api-client.js";
import type { ApiAccessEvents } from "../api/client/access-events.js";
import type { WindowFocusServiceInterface } from "../window-focus/services/types.js";

export interface FrontendStorage {}

export interface FrontendServices {
  windowFocus: WindowFocusServiceInterface;
}

/** Services and Storage shared by one running frontend app. */
export interface App {
  api: BackendApi;
  apiAccessEvents: ApiAccessEvents;
  storage: FrontendStorage;
  services: FrontendServices;
}
