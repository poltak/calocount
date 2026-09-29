export type EventListener<Event> = (event: Event) => void | Promise<void>;

export type Unsubscribe = () => void;

/** A small typed event emitter for application logic. */
export class EventEmitter<Event> {
  private readonly listeners = new Set<EventListener<Event>>();

  listen(listener: EventListener<Event>): Unsubscribe {
    this.listeners.add(listener);

    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }
      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  /** Notify every listener and ignore listener errors. */
  emit(event: Event): void {
    for (const listener of Array.from(this.listeners)) {
      try {
        const result = listener(event);
        if (result !== undefined) {
          void Promise.resolve(result).catch(() => undefined);
        }
      } catch {
        // Fire-and-forget listeners must not block other listeners.
      }
    }
  }

  /** Notify every listener and reject if one or more listeners fail. */
  async emitAsync(event: Event): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.listeners).map(async (listener) => listener(event)),
    );
    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );

    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more event listeners failed");
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  get size(): number {
    return this.listeners.size;
  }
}
