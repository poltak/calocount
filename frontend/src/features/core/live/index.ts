import {
  createApiClient,
  type ApiClientProps,
} from "../../api/client/api-client.js";
import type { App, FrontendServices, FrontendStorage } from "../../../index.js";
import { EventEmitter } from "@shadow/common/features/core/events/event-emitter";
import type { ApiAccessEvent } from "../../api/client/access-events.js";
import { LiveWindowFocusService } from "../../window-focus/services/live-window-focus-service.js";

/** Compose one frontend app with live dependencies. */
export function createApp(apiProps: ApiClientProps = {}): App {
  const storage: FrontendStorage = {};
  const services: FrontendServices = {
    windowFocus: new LiveWindowFocusService(),
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
