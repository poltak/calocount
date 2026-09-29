import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EventEmitter } from "@shadow/common/features/core/events/event-emitter";

describe("EventEmitter", () => {
  it("uses a stable listener snapshot and supports idempotent unsubscribe", async () => {
    const emitter = new EventEmitter();
    const calls = [];
    let unsubscribeSecond;

    const unsubscribeFirst = emitter.listen(() => unsubscribeSecond());
    unsubscribeSecond = emitter.listen((event) => calls.push(event));

    await emitter.emit("first");
    await emitter.emit("second");
    unsubscribeSecond();
    unsubscribeFirst();
    unsubscribeFirst();

    assert.deepEqual(calls, ["first"]);
    assert.equal(emitter.size, 0);
  });

  it("reports sync and async listener failures from emit", async () => {
    const emitter = new EventEmitter();
    const calls = [];
    emitter.listen(() => {
      throw new Error("sync failure");
    });
    emitter.listen(async () => {
      throw new Error("async failure");
    });
    emitter.listen(() => calls.push("called"));

    await assert.rejects(emitter.emit("event"), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(
        error.errors.map((listenerError) => listenerError.message),
        ["sync failure", "async failure"],
      );
      return true;
    });

    assert.deepEqual(calls, ["called"]);
  });

  it("emits without waiting and discards listener failures", async () => {
    const emitter = new EventEmitter();
    const calls = [];
    let finishListener;
    const gate = new Promise((resolve) => {
      finishListener = resolve;
    });

    emitter.listen(async (event) => {
      calls.push(`started:${event}`);
      await gate;
      calls.push(`finished:${event}`);
      throw new Error("ignored by detached emit");
    });
    emitter.listen((event) => calls.push(`other:${event}`));

    assert.equal(emitter.emitDetached("event"), undefined);
    assert.deepEqual(calls, ["started:event", "other:event"]);

    finishListener();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ["started:event", "other:event", "finished:event"]);
  });
});
