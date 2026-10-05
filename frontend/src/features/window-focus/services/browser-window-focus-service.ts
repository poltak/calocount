import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { WindowFocusServiceInterface } from "./types.js";

export class BrowserWindowFocusService implements WindowFocusServiceInterface {
  listen(listener: () => void): Unsubscribe {
    const onFocus = () => listener();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }
}
