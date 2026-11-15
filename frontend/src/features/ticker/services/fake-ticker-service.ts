import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { TickerServiceInterface } from "./types.js";

export class FakeTickerService implements TickerServiceInterface {
  private readonly listeners = new Set<() => void>();

  listen(listener: () => void): Unsubscribe {
    const onTick = () => listener();
    this.listeners.add(onTick);
    return () => this.listeners.delete(onTick);
  }

  /** One minute passes. */
  tick(): void {
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }
}
