import type { Unsubscribe } from "@shadow/common/features/core/events/event-emitter";
import type { WindowFocusService } from "./types.js";

export class LiveWindowFocusService implements WindowFocusService {
  listen(listener: () => void): Unsubscribe {
    const onFocus = () => listener();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }
}
