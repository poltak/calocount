import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { WindowFocusServiceInterface } from "./types.js";

export class FakeWindowFocusService implements WindowFocusServiceInterface {
  private readonly listeners = new Set<() => void>();

  listen(listener: () => void): Unsubscribe {
    const onFocus = () => listener();
    this.listeners.add(onFocus);
    return () => this.listeners.delete(onFocus);
  }

  focus(): void {
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }
}
