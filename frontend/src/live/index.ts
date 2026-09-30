import { createApiClient, type ApiClientProps } from "../api/client.js";
import type { App, FrontendServices, FrontendStorage } from "../index.js";
import { EventEmitter } from "@shadow/common/features/core/events/event-emitter";
import { createFrontendAuthClient } from "../api/auth-client.js";
import type { ApiAccessEvent } from "../api/access-events.js";

/** Compose one frontend app with live dependencies. */
export function createApp(apiProps: ApiClientProps = {}): App {
  const storage: FrontendStorage = {};
  const services: FrontendServices = {};

  const apiAccessEvents = new EventEmitter<ApiAccessEvent>();
  return {
    storage,
    services,
    apiAccessEvents,
    auth: createFrontendAuthClient(apiProps),
    api: createApiClient({
      ...apiProps,
      onSessionRejected: () =>
        apiAccessEvents.emitDetached({ type: "sessionRejected" }),
    }),
  };
}
