import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import { InitializationCancelledError } from "@app/common/features/core/logic/logic";
import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import { useFrontendApp } from "../ui/frontend-app-context.js";

export interface LogicStateStore<State extends object> {
  getState(): Readonly<State>;
  subscribe(listener: () => void): Unsubscribe;
}

export interface OwnedLogic<
  State extends object,
> extends LogicStateStore<State> {
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
}

export type LogicErrorHandler = (error: unknown) => void | Promise<void>;

export interface UseLogicOptions<Deps, Instance extends OwnedLogic<object>> {
  LogicClass: new (deps: Deps) => Instance;
  /** Keep this object stable. A new object creates a new Logic instance. */
  deps: Deps;
  /** Receives a failed initialization or cleanup. Without it, the logger does. */
  onError?: LogicErrorHandler;
}

interface LogicOwner {
  activeEffects: number;
  errorHandler: LogicErrorHandler | undefined;
  logger: LoggerServiceInterface;
  initializationAttempted: boolean;
  initialization?: Promise<void>;
  reportedErrors: WeakSet<object>;
}

function reportDefaultError(error: unknown, owner: LogicOwner): void {
  owner.logger.error("A UI Logic failed to initialize or clean up", { error });
}

function reportError(error: unknown, owner: LogicOwner): void {
  if (typeof error === "object" && error !== null) {
    if (owner.reportedErrors.has(error)) {
      return;
    }
    owner.reportedErrors.add(error);
  }

  if (!owner.errorHandler) {
    reportDefaultError(error, owner);
    return;
  }

  try {
    void Promise.resolve(owner.errorHandler(error)).catch(
      (handlerError: unknown) => {
        reportDefaultError(
          new AggregateError(
            [error, handlerError],
            "The Logic error handler failed",
          ),
          owner,
        );
      },
    );
  } catch (handlerError) {
    reportDefaultError(
      new AggregateError(
        [error, handlerError],
        "The Logic error handler failed",
      ),
      owner,
    );
  }
}

/**
 * Create and own one Logic instance for the lifetime of the current class and
 * stable dependency object. Constructors and plugin factories must be pure.
 * Keep this hook above React trees that disconnect effects for delayed periods,
 * such as a hidden Activity. The Logic lifecycle cannot restart after cleanup.
 */
export function useLogic<Deps, Instance extends OwnedLogic<object>>({
  LogicClass,
  deps,
  onError,
}: UseLogicOptions<Deps, Instance>): {
  logic: Instance;
  state: ReturnType<Instance["getState"]>;
} {
  const logic = useMemo(() => new LogicClass(deps), [LogicClass, deps]);
  const ownersRef = useRef(new WeakMap<object, LogicOwner>());
  const { logger } = useFrontendApp().services;

  const subscribe = useCallback(
    (listener: () => void) => logic.subscribe(listener),
    [logic],
  );
  const getSnapshot = useCallback(
    () => logic.getState() as ReturnType<Instance["getState"]>,
    [logic],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    const owners = ownersRef.current;
    let owner = owners.get(logic);
    if (!owner) {
      owner = {
        activeEffects: 0,
        errorHandler: onError,
        logger,
        initializationAttempted: false,
        reportedErrors: new WeakSet<object>(),
      };
      owners.set(logic, owner);
    }
    owner.activeEffects += 1;
    owner.errorHandler = onError;
    owner.logger = logger;

    if (!owner.initializationAttempted) {
      owner.initializationAttempted = true;
      try {
        owner.initialization = logic.initialize();
        void owner.initialization.catch((error: unknown) => {
          // Unmounting before initialization finishes is expected.
          if (!(error instanceof InitializationCancelledError)) {
            reportError(error, owner);
          }
        });
      } catch (error) {
        reportError(error, owner);
      }
    }

    return () => {
      owner.activeEffects -= 1;
      queueMicrotask(() => {
        if (owner.activeEffects !== 0) {
          return;
        }

        owners.delete(logic);
        try {
          void logic.cleanup().catch((error: unknown) => {
            reportError(error, owner);
          });
        } catch (error) {
          reportError(error, owner);
        }
      });
    };
  }, [logic, onError, logger]);

  return { logic, state };
}

/** Observe a Logic instance owned by another component or provider. */
export function useLogicInstance<State extends object>(
  logic: LogicStateStore<State>,
): Readonly<State> {
  const subscribe = useCallback(
    (listener: () => void) => logic.subscribe(listener),
    [logic],
  );
  const getSnapshot = useCallback(() => logic.getState(), [logic]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
