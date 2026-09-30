import { createApiClient, type ApiClientProps } from "../api/client.js";
import type { App, FrontendServices, FrontendStorage } from "../index.js";

/** Compose one frontend app with live dependencies. */
export function createApp(apiProps: ApiClientProps = {}): App {
  const storage: FrontendStorage = {};
  const services: FrontendServices = {};

  return { storage, services, api: createApiClient(apiProps) };
}
