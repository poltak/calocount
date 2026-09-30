import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EventEmitter } from "@shadow/common/features/core/events/event-emitter";
import { Logic } from "@shadow/common/features/core/logic/logic";
import { LogicPlugin } from "@shadow/common/features/core/logic/logic-plugin";

class CounterPlugin extends LogicPlugin {
  constructor(options) {
    super({
      deps: options.deps,
      initialState: { count: 0 },
    });
  }

  increment() {
    this.setState({ count: this.state.count + 1 });
  }

  setCount(count) {
    this.setState({ count });
  }

  async onInitialize() {
    this.deps.trace.push("plugin:init");
  }

  async onCleanup() {
    this.deps.trace.push("plugin:cleanup");
  }
}

class CounterLogic extends Logic {
  constructor(deps = { trace: [] }) {
    super({
      deps,
      initialState: { value: 0 },
      plugins: {
        counter: (pluginDeps) => new CounterPlugin({ deps: pluginDeps }),
      },
    });
    this.source = new EventEmitter();
  }

  observe() {
    this.listen(this.source, (value) => this.setState({ value }));
  }
}

class TracedPlugin extends LogicPlugin {
  constructor({ trace, name, failInitialize = false, failCleanup = false }) {
    super({
      deps: { trace, name, failInitialize, failCleanup },
      initialState: {},
    });
  }

  async onInitialize() {
    this.deps.trace.push(`init:${this.deps.name}`);
    if (this.deps.failInitialize) {
      throw new Error(`init failed: ${this.deps.name}`);
    }
  }

  async onCleanup() {
    this.deps.trace.push(`cleanup:${this.deps.name}`);
    if (this.deps.failCleanup) {
      throw new Error(`cleanup failed: ${this.deps.name}`);
    }
  }
}

class FailureLogic extends Logic {
  constructor({ trace, failCleanup = false }) {
    super({
      deps: { trace, failCleanup },
      initialState: {},
      plugins: {
        first: (deps) => new TracedPlugin({ trace: deps.trace, name: "first" }),
        failing: (deps) =>
          new TracedPlugin({
            trace: deps.trace,
            name: "failing",
            failInitialize: true,
            failCleanup,
          }),
        last: (deps) => new TracedPlugin({ trace: deps.trace, name: "last" }),
      },
    });
  }

  async onCleanup() {
    this.deps.trace.push("cleanup:logic");
    if (this.deps.failCleanup) {
      throw new Error("cleanup failed: logic");
    }
  }
}

class CleanupFailureLogic extends Logic {
  constructor(trace) {
    super({
      deps: { trace },
      initialState: {},
      plugins: {
        failing: (deps) =>
          new TracedPlugin({
            trace: deps.trace,
            name: "plugin",
            failCleanup: true,
          }),
        working: (deps) =>
          new TracedPlugin({ trace: deps.trace, name: "working" }),
      },
    });
  }

  registerFailingCleanup() {
    this.registerCleanup(() => {
      this.deps.trace.push("cleanup:callback");
      throw new Error("cleanup failed: callback");
    });
  }

  async onCleanup() {
    this.deps.trace.push("cleanup:logic");
    throw new Error("cleanup failed: logic");
  }
}

describe("Logic and LogicPlugin", () => {
  it("creates separate plugin instances and state for each Logic instance", () => {
    const first = new CounterLogic();
    const second = new CounterLogic();

    assert.notEqual(first.plugins.counter, second.plugins.counter);
    first.plugins.counter.increment();

    assert.equal(first.plugins.counter.state.count, 1);
    assert.equal(second.plugins.counter.state.count, 0);
    assert.equal(first.state.value, 0);
  });

  it("notifies subscribers synchronously only when state values change", () => {
    const logic = new CounterLogic();
    const initialState = logic.getState();
    const snapshots = [];
    const unsubscribe = logic.subscribe(() => {
      snapshots.push(logic.getState());
    });

    logic.setState({});
    logic.setState({ value: 0 });

    assert.equal(logic.getState(), initialState);
    assert.deepEqual(snapshots, []);

    logic.setState({ value: 3 });

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0], logic.getState());
    assert.notEqual(snapshots[0], initialState);

    unsubscribe();
    logic.setState({ value: 4 });
    assert.equal(snapshots.length, 1);
  });

  it("clears state subscribers during cleanup", async () => {
    const logic = new CounterLogic();
    let notifications = 0;
    const unsubscribe = logic.subscribe(() => {
      notifications += 1;
    });

    logic.setState({ value: 1 });
    assert.equal(notifications, 1);

    await logic.cleanup();
    logic.setState({ value: 2 });
    unsubscribe();

    assert.equal(notifications, 1);

    logic.subscribe(() => {
      notifications += 1;
    });
    logic.setState({ value: 3 });
    assert.equal(notifications, 1);
  });

  it("notifies plugin subscribers synchronously only when state changes", () => {
    const plugin = new CounterPlugin({ deps: { trace: [] } });
    const snapshots = [];
    const unsubscribe = plugin.subscribe(() => {
      snapshots.push(plugin.getState());
    });

    plugin.setCount(0);
    assert.deepEqual(snapshots, []);

    plugin.increment();
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0], plugin.getState());
    plugin.setCount(1);
    assert.equal(snapshots.length, 1);

    plugin.setCount(2);
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[1], plugin.getState());

    unsubscribe();
    plugin.increment();
    assert.equal(snapshots.length, 2);
  });

  it("clears plugin state subscribers during cleanup", async () => {
    const plugin = new CounterPlugin({ deps: { trace: [] } });
    let notifications = 0;
    plugin.subscribe(() => {
      notifications += 1;
    });

    plugin.increment();
    assert.equal(notifications, 1);

    await plugin.cleanup();
    plugin.increment();

    assert.equal(notifications, 1);

    plugin.subscribe(() => {
      notifications += 1;
    });
    plugin.increment();
    assert.equal(notifications, 1);
  });

  it("runs concurrent initialization requests once", async () => {
    let finishInitialization;
    let signalInitializationStarted;
    const gate = new Promise((resolve) => {
      finishInitialization = resolve;
    });
    const started = new Promise((resolve) => {
      signalInitializationStarted = resolve;
    });
    const trace = [];

    class WaitingPlugin extends LogicPlugin {
      constructor(deps) {
        super({ deps, initialState: {} });
      }

      async onInitialize() {
        this.deps.trace.push("init:waiting");
        signalInitializationStarted();
        await this.deps.gate;
      }
    }

    class WaitingLogic extends Logic {
      constructor(deps) {
        super({
          deps,
          initialState: {},
          plugins: { waiting: (pluginDeps) => new WaitingPlugin(pluginDeps) },
        });
      }
    }

    const logic = new WaitingLogic({ trace, gate });
    const firstInitialization = logic.initialize();
    const secondInitialization = logic.initialize();

    assert.deepEqual(trace, []);
    await started;
    assert.deepEqual(trace, ["init:waiting"]);
    finishInitialization();
    await Promise.all([firstInitialization, secondInitialization]);
    assert.deepEqual(trace, ["init:waiting"]);
  });

  it("waits for in-flight initialization before cleanup", async () => {
    let finishInitialization;
    let signalInitializationStarted;
    const gate = new Promise((resolve) => {
      finishInitialization = resolve;
    });
    const started = new Promise((resolve) => {
      signalInitializationStarted = resolve;
    });
    const trace = [];

    class WaitingPlugin extends LogicPlugin {
      constructor(deps) {
        super({ deps, initialState: {} });
      }

      async onInitialize() {
        this.deps.trace.push("init:waiting");
        signalInitializationStarted();
        await this.deps.gate;
        this.deps.trace.push("init:finished");
      }

      async onCleanup() {
        this.deps.trace.push("cleanup:plugin");
      }
    }

    class WaitingLogic extends Logic {
      constructor(deps) {
        super({
          deps,
          initialState: {},
          plugins: { waiting: (pluginDeps) => new WaitingPlugin(pluginDeps) },
        });
      }
    }

    const logic = new WaitingLogic({ trace, gate });
    const initialization = logic.initialize();

    assert.deepEqual(trace, []);
    await started;
    const cleanup = logic.cleanup();

    assert.deepEqual(trace, ["init:waiting"]);
    finishInitialization();

    await assert.rejects(
      initialization,
      /Logic cleanup started before initialization completed/,
    );
    await cleanup;
    assert.deepEqual(trace, [
      "init:waiting",
      "init:finished",
      "cleanup:plugin",
    ]);
  });

  it("assigns the Logic initialization promise before its hook runs", async () => {
    const trace = [];

    class CleanupRequestLogic extends Logic {
      constructor() {
        super({ deps: { trace }, initialState: {} });
      }

      async onInitialize() {
        trace.push("logic:init:start");
        void this.cleanup();
        trace.push("logic:init:end");
      }

      async onCleanup() {
        trace.push("logic:cleanup");
      }
    }

    const logic = new CleanupRequestLogic();
    await logic.initialize();
    await logic.cleanup();

    assert.deepEqual(trace, [
      "logic:init:start",
      "logic:init:end",
      "logic:cleanup",
    ]);
  });

  it("assigns the plugin initialization promise before its hook runs", async () => {
    const trace = [];

    class CleanupRequestPlugin extends LogicPlugin {
      constructor() {
        super({ deps: { trace }, initialState: {} });
      }

      async onInitialize() {
        this.deps.trace.push("plugin:init:start");
        void this.cleanup();
        this.deps.trace.push("plugin:init:end");
      }

      async onCleanup() {
        this.deps.trace.push("plugin:cleanup");
      }
    }

    const plugin = new CleanupRequestPlugin();
    await plugin.initialize();
    await plugin.cleanup();

    assert.deepEqual(trace, [
      "plugin:init:start",
      "plugin:init:end",
      "plugin:cleanup",
    ]);
  });

  it("cleans listeners and plugins once", async () => {
    const trace = [];
    const logic = new CounterLogic({ trace });
    logic.observe();
    await logic.source.emit(3);

    await Promise.all([logic.initialize(), logic.initialize()]);
    await Promise.all([logic.cleanup(), logic.cleanup()]);
    await logic.source.emit(7);
    await logic.cleanup();

    assert.equal(logic.state.value, 3);
    assert.deepEqual(trace, ["plugin:init", "plugin:cleanup"]);
  });

  it("rolls back after plugin initialization fails and reports the failure", async () => {
    const trace = [];
    const logic = new FailureLogic({ trace });

    await assert.rejects(logic.initialize(), /init failed: failing/);
    await logic.cleanup();

    assert.deepEqual(trace, [
      "init:first",
      "init:failing",
      "cleanup:logic",
      "cleanup:last",
      "cleanup:failing",
      "cleanup:first",
    ]);
  });

  it("continues all cleanup steps and reports their errors", async () => {
    const trace = [];
    const logic = new CleanupFailureLogic(trace);
    logic.registerFailingCleanup();

    await assert.rejects(logic.cleanup(), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 3);
      return true;
    });

    assert.deepEqual(trace, [
      "cleanup:logic",
      "cleanup:callback",
      "cleanup:working",
      "cleanup:plugin",
    ]);
  });

  it("aggregates cleanup errors with an initialization failure", async () => {
    const trace = [];
    const logic = new FailureLogic({ trace, failCleanup: true });

    await assert.rejects(logic.initialize(), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /initialization and cleanup failed/);
      assert.equal(error.errors.length, 2);
      return true;
    });

    assert.deepEqual(trace, [
      "init:first",
      "init:failing",
      "cleanup:logic",
      "cleanup:last",
      "cleanup:failing",
      "cleanup:first",
    ]);
  });
});
