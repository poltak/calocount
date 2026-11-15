import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { WindowFocusServiceInterface } from "./types.js";

/**
 * Tells the listener that the person came back to the page. A switch to
 * another window and back fires only `focus`. A switch between the tabs of one
 * window, or a screen that wakes, fires only `visibilitychange`. One return
 * can fire both, so a return calls the listener once, in the next frame.
 */
export class BrowserWindowFocusService implements WindowFocusServiceInterface {
  listen(listener: () => void): Unsubscribe {
    let frame: number | null = null;
    const onReturn = () => {
      if (document.hidden || frame !== null) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = null;
        listener();
      });
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }
}
