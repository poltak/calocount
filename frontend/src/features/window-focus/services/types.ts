import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";

export interface WindowFocusServiceInterface {
  listen(listener: () => void): Unsubscribe;
}
