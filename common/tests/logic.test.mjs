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

  it("runs concurrent initialization requests once", async () => {
    let finishInitialization;
    const gate = new Promise((resolve) => {
      finishInitialization = resolve;
    });
    const trace = [];

    class WaitingPlugin extends LogicPlugin {
      constructor(deps) {
        super({ deps, initialState: {} });
      }

      async onInitialize() {
        this.deps.trace.push("init:waiting");
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

    assert.deepEqual(trace, ["init:waiting"]);
    finishInitialization();
    await Promise.all([firstInitialization, secondInitialization]);
    assert.deepEqual(trace, ["init:waiting"]);
  });

  it("waits for in-flight initialization before cleanup", async () => {
    let finishInitialization;
    const gate = new Promise((resolve) => {
      finishInitialization = resolve;
    });
    const trace = [];

    class WaitingPlugin extends LogicPlugin {
      constructor(deps) {
        super({ deps, initialState: {} });
      }

      async onInitialize() {
        this.deps.trace.push("init:waiting");
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

  it("cleans listeners and plugins once", async () => {
    const trace = [];
    const logic = new CounterLogic({ trace });
    logic.observe();
    logic.source.emit(3);

    await Promise.all([logic.initialize(), logic.initialize()]);
    await Promise.all([logic.cleanup(), logic.cleanup()]);
    logic.source.emit(7);
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
