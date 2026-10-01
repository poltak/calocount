import {
  EventEmitter,
  type EventListener,
  type Unsubscribe,
} from "../events/event-emitter.js";

export interface LogicPluginLifecycle {
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
}

export type LogicPluginFactories<
  Deps,
  Plugins extends Record<string, LogicPluginLifecycle>,
> = {
  [Key in keyof Plugins]: (deps: Deps) => Plugins[Key];
};

export interface LogicOptions<
  Deps,
  State extends object,
  Plugins extends Record<string, LogicPluginLifecycle> = Record<string, never>,
> {
  deps: Deps;
  initialState: State;
  /** Each factory must return a new plugin instance for this Logic instance. */
  plugins?: LogicPluginFactories<Deps, Plugins>;
}

/** Cleanup started before initialization finished, so initialization stopped. */
export class InitializationCancelledError extends Error {
  constructor() {
    super("Logic cleanup started before initialization completed");
    this.name = "InitializationCancelledError";
  }
}

type LifecycleState =
  "new" | "initializing" | "initialized" | "failed" | "cleaning" | "cleaned";

/** Stateful application logic with explicit state, dependencies, and lifecycle. */
export abstract class Logic<
  Deps,
  State extends object,
  Event = never,
  Plugins extends Record<string, LogicPluginLifecycle> = Record<string, never>,
> implements LogicPluginLifecycle {
  readonly events = new EventEmitter<Event>();
  readonly plugins: Readonly<Plugins>;

  protected readonly deps: Deps;
  private currentState: State;
  private readonly stateListeners = new Set<() => void>();
  private readonly cleanupCallbacks = new Set<Unsubscribe>();
  private lifecycleState: LifecycleState = "new";
  private initializationPromise?: Promise<void>;
  private cleanupPromise?: Promise<void>;

  constructor(options: LogicOptions<Deps, State, Plugins>) {
    this.deps = options.deps;
    this.currentState = { ...options.initialState };
    this.plugins = this.createPluginInstances(options.plugins, options.deps);
  }

  get state(): Readonly<State> {
    return this.currentState;
  }

  getState(): Readonly<State> {
    return this.currentState;
  }

  subscribe(listener: () => void): Unsubscribe {
    if (this.isClosed()) {
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

  /**
   * Initialize plugins, then this Logic. Rejects with
   * InitializationCancelledError when cleanup starts first.
   */
  initialize(): Promise<void> {
    if (this.lifecycleState === "initialized") {
      return Promise.resolve();
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    if (this.lifecycleState !== "new") {
      return Promise.reject(
        new Error(`Cannot initialize Logic while ${this.lifecycleState}`),
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
    if (this.isClosed()) {
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

  private isClosed(): boolean {
    return (
      this.lifecycleState === "failed" ||
      this.lifecycleState === "cleaning" ||
      this.lifecycleState === "cleaned"
    );
  }

  private throwIfCleanupStarted(): void {
    if (this.lifecycleState !== "initializing") {
      throw new InitializationCancelledError();
    }
  }

  private async runInitialize(): Promise<void> {
    try {
      for (const plugin of Object.values(this.plugins)) {
        this.throwIfCleanupStarted();
        await plugin.initialize();
      }

      this.throwIfCleanupStarted();
      await this.onInitialize();
      this.throwIfCleanupStarted();
      this.lifecycleState = "initialized";
    } catch (initializationError) {
      if (this.lifecycleState === "cleaning") {
        throw initializationError;
      }

      this.lifecycleState = "failed";
      const cleanupPromise = this.performCleanup();
      this.cleanupPromise = cleanupPromise;

      try {
        await cleanupPromise;
      } catch (cleanupError) {
        // oxlint-disable-next-line eslint/preserve-caught-error -- The cause is in the AggregateError options.
        throw new AggregateError(
          [initializationError, cleanupError],
          "Logic initialization and cleanup failed",
          { cause: initializationError },
        );
      }

      throw initializationError;
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

    // Plugin cleanup is idempotent, so a plugin that already rolled back is safe.
    const plugins = Object.values(this.plugins);
    for (let index = plugins.length - 1; index >= 0; index -= 1) {
      try {
        await plugins[index].cleanup();
      } catch (error) {
        errors.push(error);
      }
    }

    this.events.clear();
    this.stateListeners.clear();
    this.lifecycleState = "cleaned";

    if (errors.length > 0) {
      throw new AggregateError(errors, "Logic cleanup failed");
    }
  }

  private createPluginInstances(
    factories: LogicPluginFactories<Deps, Plugins> | undefined,
    deps: Deps,
  ): Readonly<Plugins> {
    const plugins: Record<string, LogicPluginLifecycle> = {};
    for (const [name, createPlugin] of Object.entries(factories ?? {})) {
      plugins[name] = createPlugin(deps);
    }
    return Object.freeze(plugins) as Plugins;
  }
}
