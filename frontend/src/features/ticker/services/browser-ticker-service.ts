import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { TickerServiceInterface } from "./types.js";

const MINUTE_MS = 60_000;

export class BrowserTickerService implements TickerServiceInterface {
  listen(listener: () => void): Unsubscribe {
    const timer = setInterval(listener, MINUTE_MS);
    return () => clearInterval(timer);
  }
}
