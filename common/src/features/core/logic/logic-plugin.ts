import {
  EventEmitter,
  type EventListener,
  type Unsubscribe,
} from "../events/event-emitter.js";

export interface LogicPluginOptions<Deps, State extends object> {
  deps: Deps;
  initialState: State;
}

export interface LogicPluginLifecycle {
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
}

type LifecycleState =
  "new" | "initializing" | "initialized" | "failed" | "cleaning" | "cleaned";

/** A separately testable state slice owned by one Logic instance. */
export abstract class LogicPlugin<
  Deps,
  State extends object,
  Event = never,
> implements LogicPluginLifecycle {
  readonly events = new EventEmitter<Event>();

  protected readonly deps: Deps;
  private currentState: State;
  private readonly stateListeners = new Set<() => void>();
  private readonly cleanupCallbacks = new Set<Unsubscribe>();
  private lifecycleState: LifecycleState = "new";
  private initializationPromise?: Promise<void>;
  private cleanupPromise?: Promise<void>;

  constructor({ deps, initialState }: LogicPluginOptions<Deps, State>) {
    this.deps = deps;
    this.currentState = { ...initialState };
  }

  get state(): Readonly<State> {
    return this.currentState;
  }

  getState(): Readonly<State> {
    return this.currentState;
  }

  subscribe(listener: () => void): Unsubscribe {
    if (
      this.lifecycleState === "failed" ||
      this.lifecycleState === "cleaning" ||
      this.lifecycleState === "cleaned"
    ) {
      return () => undefined;
    }

    this.stateListeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }
      subscribed = false;
      this.stateListeners.delete(listener);
    };
  }

  protected setState(updates: Partial<State>): void {
    const currentState = this.currentState;
    const hasChangedValue = Object.entries(updates).some(
      ([key, value]) => !Object.is(currentState[key as keyof State], value),
    );
    if (!hasChangedValue) {
      return;
    }

    this.currentState = { ...currentState, ...updates };
    const listeners = Array.from(this.stateListeners);
    for (const listener of listeners) {
      listener();
    }
  }

  initialize(): Promise<void> {
    if (this.lifecycleState === "initialized") {
      return Promise.resolve();
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    if (this.lifecycleState !== "new") {
      return Promise.reject(
        new Error(`Cannot initialize a plugin while ${this.lifecycleState}`),
      );
    }

    this.lifecycleState = "initializing";
    const promise = Promise.resolve().then(() => this.runInitialize());
    this.initializationPromise = promise;
    return promise;
  }

  protected async onInitialize(): Promise<void> {}

  protected async onCleanup(): Promise<void> {}

  protected listen<OtherEvent>(
    emitter: EventEmitter<OtherEvent>,
    listener: EventListener<OtherEvent>,
  ): Unsubscribe {
    return this.registerCleanup(emitter.listen(listener));
  }

  protected registerCleanup(cleanup: Unsubscribe): Unsubscribe {
    if (
      this.lifecycleState === "cleaning" ||
      this.lifecycleState === "cleaned"
    ) {
      cleanup();
      return () => undefined;
    }

    let registered = true;
    const runOnce = () => {
      if (!registered) {
        return;
      }
      registered = false;
      this.cleanupCallbacks.delete(runOnce);
      cleanup();
    };
    this.cleanupCallbacks.add(runOnce);
    return runOnce;
  }

  cleanup(): Promise<void> {
    if (this.cleanupPromise) {
      return this.cleanupPromise;
    }

    this.lifecycleState = "cleaning";
    const initializationPromise = this.initializationPromise;
    const promise = (async () => {
      if (initializationPromise) {
        await initializationPromise.catch(() => undefined);
      }
      await this.performCleanup();
    })();
    this.cleanupPromise = promise;
    return promise;
  }

  private async runInitialize(): Promise<void> {
    try {
      await this.onInitialize();
      if (this.lifecycleState === "initializing") {
        this.lifecycleState = "initialized";
      }
    } catch (error) {
      if (this.lifecycleState === "initializing") {
        this.lifecycleState = "failed";
      }
      throw error;
    }
  }

  private async performCleanup(): Promise<void> {
    const errors: unknown[] = [];

    try {
      await this.onCleanup();
    } catch (error) {
      errors.push(error);
    }

    const cleanupCallbacks = Array.from(this.cleanupCallbacks);
    for (let index = cleanupCallbacks.length - 1; index >= 0; index -= 1) {
      const cleanup = cleanupCallbacks[index];
      this.cleanupCallbacks.delete(cleanup);
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }

    this.events.clear();
    this.stateListeners.clear();
    this.lifecycleState = "cleaned";

    if (errors.length > 0) {
      throw new AggregateError(errors, "Logic plugin cleanup failed");
    }
  }
}
