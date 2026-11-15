import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";

/** Calls its listeners once a minute, for as long as they listen. */
export interface TickerServiceInterface {
  listen(listener: () => void): Unsubscribe;
}
