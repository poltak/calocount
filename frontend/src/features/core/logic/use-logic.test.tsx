import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import * as React from "react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Logic } from "@shadow/common/features/core/logic/logic";
import { LogicPlugin } from "@shadow/common/features/core/logic/logic-plugin";
import { useLogic, useLogicInstance } from "./use-logic.js";

afterEach(cleanup);

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

interface CounterDeps {
  label: string;
  trace: string[];
}

interface CounterState {
  value: number;
}

class CounterLogic extends Logic<CounterDeps, CounterState> {
  constructor(deps: CounterDeps) {
    super({ deps, initialState: { value: 0 } });
  }

  increment(): void {
    this.setState({ value: this.state.value + 1 });
  }

  protected override async onInitialize(): Promise<void> {
    this.deps.trace.push(`init:${this.deps.label}`);
  }

  protected override async onCleanup(): Promise<void> {
    this.deps.trace.push(`cleanup:${this.deps.label}`);
  }
}

class AlternateCounterLogic extends CounterLogic {
  protected override async onInitialize(): Promise<void> {
    this.deps.trace.push(`alternate:init:${this.deps.label}`);
  }

  protected override async onCleanup(): Promise<void> {
    this.deps.trace.push(`alternate:cleanup:${this.deps.label}`);
  }
}

interface CounterViewProps {
  LogicClass: typeof CounterLogic;
  deps: CounterDeps;
  onError?: (error: unknown) => void | Promise<void>;
  onLogic?: (logic: CounterLogic) => void;
  revision?: string;
}

function CounterView({
  LogicClass,
  deps,
  onError,
  onLogic,
  revision,
}: CounterViewProps) {
  const { logic, state } = useLogic({ LogicClass, deps, onError });

  useEffect(() => {
    onLogic?.(logic);
  }, [logic, onLogic]);

  return (
    <button data-revision={revision} onClick={() => logic.increment()}>
      {state.value}
    </button>
  );
}

interface DynamicCounterViewProps {
  LogicClass: typeof CounterLogic | typeof AlternateCounterLogic;
  deps: CounterDeps;
  onLogic: (logic: CounterLogic | AlternateCounterLogic) => void;
}

function DynamicCounterView({
  LogicClass,
  deps,
  onLogic,
}: DynamicCounterViewProps) {
  const { logic, state } = useLogic({ LogicClass, deps });

  useEffect(() => {
    onLogic(logic);
  }, [logic, onLogic]);

  return <button onClick={() => logic.increment()}>{state.value}</button>;
}

class FailingInitializationLogic extends CounterLogic {
  protected override async onInitialize(): Promise<void> {
    throw new Error("initialization failed");
  }
}

class FailingCleanupLogic extends CounterLogic {
  protected override async onCleanup(): Promise<void> {
    throw new Error("cleanup failed");
  }
}

interface PendingFailureDeps extends CounterDeps {
  gate: Promise<void>;
  initializationError: Error;
  signalStarted: () => void;
}

class PendingFailureLogic extends Logic<PendingFailureDeps, CounterState> {
  constructor(deps: PendingFailureDeps) {
    super({ deps, initialState: { value: 0 } });
  }

  protected override async onInitialize(): Promise<void> {
    this.deps.signalStarted();
    await this.deps.gate;
    throw this.deps.initializationError;
  }

  protected override async onCleanup(): Promise<void> {
    this.deps.trace.push("pending:cleanup");
  }
}

class CounterPlugin extends LogicPlugin<CounterDeps, { count: number }> {
  constructor(deps: CounterDeps) {
    super({ deps, initialState: { count: 0 } });
  }

  increment(): void {
    this.setState({ count: this.state.count + 1 });
  }
}

class PluginOwnerLogic extends Logic<
  CounterDeps,
  { parentValue: number },
  never,
  { counter: CounterPlugin }
> {
  constructor(deps: CounterDeps) {
    super({
      deps,
      initialState: { parentValue: 0 },
      plugins: {
        counter: (pluginDeps) => new CounterPlugin(pluginDeps),
      },
    });
  }

  copyPluginCount(): void {
    this.setState({ parentValue: this.plugins.counter.state.count });
  }
}

interface PendingDeps extends CounterDeps {
  gate: Promise<void>;
  signalStarted: () => void;
}

class PendingLogic extends Logic<PendingDeps, CounterState> {
  constructor(deps: PendingDeps) {
    super({ deps, initialState: { value: 0 } });
  }

  protected override async onInitialize(): Promise<void> {
    this.deps.signalStarted();
    await this.deps.gate;
  }

  protected override async onCleanup(): Promise<void> {
    this.deps.trace.push("pending:cleanup");
  }
}

function LogicObserver({ logic, id }: { logic: CounterLogic; id: string }) {
  const state = useLogicInstance(logic);
  return <output data-testid={id}>{state.value}</output>;
}

function PluginObserver({ logic }: { logic: PluginOwnerLogic }) {
  const state = useLogicInstance(logic.plugins.counter);
  return <output data-testid="plugin-state">{state.count}</output>;
}

function ParentLogicObserver({ logic }: { logic: PluginOwnerLogic }) {
  const state = useLogicInstance(logic);
  return <output data-testid="parent-state">{state.parentValue}</output>;
}

describe("useLogic", () => {
  it("returns the instance on the first render and rerenders for state changes", async () => {
    const deps = { label: "stable", trace: [] };
    const instances: CounterLogic[] = [];
    const onLogic = (logic: CounterLogic) => instances.push(logic);
    const view = (
      <CounterView LogicClass={CounterLogic} deps={deps} onLogic={onLogic} />
    );
    const { rerender } = render(view);

    expect(screen.getByRole("button").textContent).toBe("0");
    await waitFor(() => expect(deps.trace).toContain("init:stable"));
    const logic = instances.at(-1);
    expect(logic).toBeDefined();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").textContent).toBe("1");

    rerender(
      <CounterView
        LogicClass={CounterLogic}
        deps={deps}
        onLogic={onLogic}
        revision="same-deps-rerender"
      />,
    );
    expect(screen.getByRole("button").getAttribute("data-revision")).toBe(
      "same-deps-rerender",
    );
    expect(instances.at(-1)).toBe(logic);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").textContent).toBe("2");
  });

  it("replaces the instance when the class or dependency identity changes", async () => {
    const firstDeps = { label: "first", trace: [] as string[] };
    const secondDeps = { label: "second", trace: [] as string[] };
    const instances: Array<CounterLogic | AlternateCounterLogic> = [];
    const onLogic = (logic: CounterLogic | AlternateCounterLogic) => {
      instances.push(logic);
    };
    const { rerender, unmount } = render(
      <DynamicCounterView
        LogicClass={CounterLogic}
        deps={firstDeps}
        onLogic={onLogic}
      />,
    );
    await waitFor(() => expect(firstDeps.trace).toContain("init:first"));
    const firstLogic = instances.at(-1);

    rerender(
      <DynamicCounterView
        LogicClass={AlternateCounterLogic}
        deps={firstDeps}
        onLogic={onLogic}
      />,
    );
    await waitFor(() => {
      expect(firstDeps.trace).toContain("cleanup:first");
      expect(firstDeps.trace).toContain("alternate:init:first");
    });
    const secondLogic = instances.at(-1);
    expect(secondLogic).not.toBe(firstLogic);

    rerender(
      <DynamicCounterView
        LogicClass={AlternateCounterLogic}
        deps={secondDeps}
        onLogic={onLogic}
      />,
    );
    await waitFor(() => {
      expect(firstDeps.trace).toContain("alternate:cleanup:first");
      expect(secondDeps.trace).toContain("alternate:init:second");
    });
    expect(instances.at(-1)).not.toBe(secondLogic);

    unmount();
    await waitFor(() =>
      expect(secondDeps.trace).toContain("alternate:cleanup:second"),
    );
  });

  it("runs init and final cleanup once when Strict Mode replays effects", async () => {
    const deps = { label: "strict", trace: [] as string[] };
    const { unmount } = render(
      <React.StrictMode>
        <CounterView LogicClass={CounterLogic} deps={deps} />
      </React.StrictMode>,
    );

    await waitFor(() => expect(deps.trace).toContain("init:strict"));
    expect(deps.trace.filter((entry) => entry === "init:strict")).toHaveLength(
      1,
    );
    expect(deps.trace).not.toContain("cleanup:strict");

    unmount();
    await waitFor(() => expect(deps.trace).toContain("cleanup:strict"));
    expect(
      deps.trace.filter((entry) => entry === "cleanup:strict"),
    ).toHaveLength(1);
  });

  it("reports initialization and cleanup errors without unhandled rejections", async () => {
    const deps = { label: "errors", trace: [] as string[] };
    const onError = vi.fn<(error: unknown) => void>();
    const { unmount } = render(
      <CounterView
        LogicClass={FailingInitializationLogic}
        deps={deps}
        onError={onError}
      />,
    );

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      message: "initialization failed",
    });

    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    const cleanupDeps = { label: "cleanup-error", trace: [] as string[] };
    const cleanupErrorHandler = vi.fn<(error: unknown) => void>();
    const cleanupView = render(
      <CounterView
        LogicClass={FailingCleanupLogic}
        deps={cleanupDeps}
        onError={cleanupErrorHandler}
      />,
    );
    await waitFor(() =>
      expect(cleanupDeps.trace).toContain("init:cleanup-error"),
    );

    cleanupView.unmount();
    await waitFor(() => expect(cleanupErrorHandler).toHaveBeenCalledTimes(1));
    expect(cleanupErrorHandler.mock.calls[0]?.[0]).toMatchObject({
      message: "Logic cleanup failed",
    });
  });

  it("waits for an in-flight initialization before cleaning up after unmount", async () => {
    const initialization = createDeferred<void>();
    const startSignal = createDeferred<void>();
    const initializationError = new Error("pending initialization failed");
    const deps: PendingFailureDeps = {
      label: "pending",
      trace: [],
      gate: initialization.promise,
      initializationError,
      signalStarted: () => startSignal.resolve(undefined),
    };
    const onError = vi.fn<(error: unknown) => void>();

    function PendingView() {
      const { state } = useLogic({
        LogicClass: PendingFailureLogic,
        deps,
        onError,
      });
      return <output>{state.value}</output>;
    }

    const { unmount } = render(<PendingView />);
    await startSignal.promise;
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(deps.trace).not.toContain("pending:cleanup");

    initialization.resolve(undefined);
    await waitFor(() => expect(deps.trace).toContain("pending:cleanup"));
    expect(
      deps.trace.filter((entry) => entry === "pending:cleanup"),
    ).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(initializationError);
  });
});

describe("useLogic cancellation", () => {
  it("does not report an error when unmounting before initialization finishes", async () => {
    const initialization = createDeferred<void>();
    const startSignal = createDeferred<void>();
    const deps: PendingDeps = {
      label: "pending",
      trace: [],
      gate: initialization.promise,
      signalStarted: () => startSignal.resolve(undefined),
    };
    const onError = vi.fn<(error: unknown) => void>();

    function PendingView() {
      const { state } = useLogic({ LogicClass: PendingLogic, deps, onError });
      return <output>{state.value}</output>;
    }

    const { unmount } = render(<PendingView />);
    await startSignal.promise;
    unmount();
    initialization.resolve(undefined);

    await waitFor(() => expect(deps.trace).toContain("pending:cleanup"));
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("useLogicInstance", () => {
  it("supports concurrent observers of one Logic without changing its methods", () => {
    const deps = { label: "shared", trace: [] };
    const logic = new CounterLogic(deps);
    const originalGetState = logic.getState;
    const originalSubscribe = logic.subscribe;

    const { unmount } = render(
      <>
        <LogicObserver logic={logic} id="first-observer" />
        <LogicObserver logic={logic} id="second-observer" />
      </>,
    );

    act(() => logic.increment());
    expect(screen.getByTestId("first-observer").textContent).toBe("1");
    expect(screen.getByTestId("second-observer").textContent).toBe("1");
    expect(logic.getState).toBe(originalGetState);
    expect(logic.subscribe).toBe(originalSubscribe);

    unmount();
    expect(deps.trace).toEqual([]);
  });

  it("observes plugin state without merging it into parent Logic state", async () => {
    const logic = new PluginOwnerLogic({ label: "plugin", trace: [] });
    let parentNotifications = 0;
    logic.subscribe(() => {
      parentNotifications += 1;
    });

    const { unmount } = render(
      <>
        <PluginObserver logic={logic} />
        <ParentLogicObserver logic={logic} />
      </>,
    );
    act(() => logic.plugins.counter.increment());

    expect(screen.getByTestId("plugin-state").textContent).toBe("1");
    expect(logic.state.parentValue).toBe(0);
    expect(screen.getByTestId("parent-state").textContent).toBe("0");
    expect(parentNotifications).toBe(0);

    act(() => {
      logic.copyPluginCount();
    });
    expect(screen.getByTestId("parent-state").textContent).toBe("1");
    expect(parentNotifications).toBe(1);

    unmount();
    await logic.cleanup();
  });
});
