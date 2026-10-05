import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";

/** Browser capability: notifies listeners when the user returns to the window. */
export interface WindowFocusServiceInterface {
  listen(listener: () => void): Unsubscribe;
}
