import type { BackendApi } from "./api/client.js";

export interface FrontendStorage {}

export interface FrontendServices {}

/** Services and Storage shared by one running frontend app. */
export interface App {
  api: BackendApi;
  storage: FrontendStorage;
  services: FrontendServices;
}
