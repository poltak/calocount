import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EventEmitter } from "@shadow/common/features/core/events/event-emitter";

describe("EventEmitter", () => {
  it("uses a stable listener snapshot and supports idempotent unsubscribe", () => {
    const emitter = new EventEmitter();
    const calls = [];
    let unsubscribeSecond;

    const unsubscribeFirst = emitter.listen(() => unsubscribeSecond());
    unsubscribeSecond = emitter.listen((event) => calls.push(event));

    emitter.emit("first");
    emitter.emit("second");
    unsubscribeSecond();
    unsubscribeFirst();
    unsubscribeFirst();

    assert.deepEqual(calls, ["first"]);
    assert.equal(emitter.size, 0);
  });

  it("reports all async listener failures from emitAsync", async () => {
    const emitter = new EventEmitter();
    emitter.listen(async () => {
      throw new Error("first failure");
    });
    emitter.listen(async () => {
      throw new Error("second failure");
    });

    await assert.rejects(emitter.emitAsync("event"), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(
        error.errors.map((listenerError) => listenerError.message),
        ["first failure", "second failure"],
      );
      return true;
    });
  });

  it("does not stop emit when a listener throws", () => {
    const emitter = new EventEmitter();
    const calls = [];
    emitter.listen(() => {
      throw new Error("ignored by fire-and-forget emit");
    });
    emitter.listen(() => calls.push("called"));

    emitter.emit("event");

    assert.deepEqual(calls, ["called"]);
  });
});
