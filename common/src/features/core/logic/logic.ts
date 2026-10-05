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

/** The progress of one async operation, held in Logic state for the UI. */
export type TaskState = "pristine" | "running" | "success" | "error";

type Exactly<Actual, Expected> = [Actual] extends [Expected]
  ? [Expected] extends [Actual]
    ? true
    : false
  : false;

/**
 * The messages for single fields of what a task sent, by each field's path. A
 * task that sends a form can hold them in state as `<name>FieldErrors`.
 */
export type TaskFieldErrors = Readonly<Record<string, string>>;

/** A field errors entry, when the state has one, must have the right type. */
type FieldErrorsFit<
  State,
  Name extends string,
> = `${Name}FieldErrors` extends keyof State
  ? Exactly<State[`${Name}FieldErrors`], TaskFieldErrors | null>
  : true;

/**
 * Every name `foo` for which the state has both `fooState: TaskState` and
 * `fooError: string | null`. A name without both fields does not compile. The
 * state can also have `fooFieldErrors: TaskFieldErrors | null`.
 */
export type TaskName<State> = {
  [Key in keyof State & string]: Key extends `${infer Name}State`
    ? `${Name}Error` extends keyof State
      ? Exactly<State[Key], TaskState> extends true
        ? Exactly<State[`${Name}Error`], string | null> extends true
          ? FieldErrorsFit<State, Name> extends true
            ? Name
            : never
          : never
        : never
      : never
    : never;
}[keyof State & string];

/**
 * The field messages that a failure carries. A failed request has them when
 * the backend refused single fields of its input.
 */
function readFieldErrors(error: unknown): TaskFieldErrors | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("issues" in error) ||
    !Array.isArray(error.issues)
  ) {
    return null;
  }

  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues as unknown[]) {
    if (
      typeof issue === "object" &&
      issue !== null &&
      "path" in issue &&
      typeof issue.path === "string" &&
      "message" in issue &&
      typeof issue.message === "string"
    ) {
      // The first message for a field is the one to show.
      fieldErrors[issue.path] ??= issue.message;
    }
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}

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
  private readonly abortController = new AbortController();
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

  /**
   * Aborts when cleanup starts. Pass it to requests and other async work so
   * teardown cancels them.
   */
  protected get signal(): AbortSignal {
    return this.abortController.signal;
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

  /** Ignored once cleanup starts, so late async work cannot change state. */
  protected setState(updates: Partial<State>): void {
    if (this.isClosed()) {
      return;
    }

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
   * Run one async operation and record its progress in `<name>State` and
   * `<name>Error`. A call made while the same task is running does nothing.
   * A failure is recorded in state and never thrown to the caller.
   *
   * When the state also has `<name>FieldErrors`, a failure that names single
   * fields puts their messages there, and every other outcome sets it to
   * `null`.
   */
  protected async executeTask(
    name: TaskName<State>,
    task: () => Promise<void>,
  ): Promise<void> {
    const stateKey = `${name}State` as keyof State;
    const errorKey = `${name}Error` as keyof State;
    const fieldErrorsKey = `${name}FieldErrors` as keyof State;
    if (this.currentState[stateKey] === "running") {
      return;
    }

    const fieldErrors = (value: TaskFieldErrors | null) =>
      fieldErrorsKey in this.currentState ? { [fieldErrorsKey]: value } : {};
    this.setState({
      [stateKey]: "running",
      [errorKey]: null,
      ...fieldErrors(null),
    } as Partial<State>);
    try {
      await task();
      this.setState({ [stateKey]: "success" } as Partial<State>);
    } catch (error) {
      // After cleanup starts, setState ignores this, so a cancelled task
      // records no error.
      this.setState({
        [stateKey]: "error",
        [errorKey]: error instanceof Error ? error.message : String(error),
        ...fieldErrors(readFieldErrors(error)),
      } as Partial<State>);
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
    this.abortController.abort();
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
      this.abortController.abort();
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

    // The callback that was registered last runs first.
    const cleanupCallbacks = Array.from(this.cleanupCallbacks);
    cleanupCallbacks.reverse();
    for (const cleanup of cleanupCallbacks) {
      this.cleanupCallbacks.delete(cleanup);
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }

    // Plugin cleanup is idempotent, so a plugin that already rolled back is safe.
    const plugins = Object.values(this.plugins);
    plugins.reverse();
    for (const plugin of plugins) {
      try {
        await plugin.cleanup();
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
