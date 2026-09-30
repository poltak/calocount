import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestBackend } from "../dist/tests/api.js";

describe("in-memory backend transport", () => {
  it("initializes Logic and runs handlers without network fetch", async (context) => {
    const backend = await createTestBackend();
    context.after(() => backend.close());
    const network = context.mock.method(globalThis, "fetch", async () => {
      throw new Error("Network must not be used");
    });
    const initialize = context.mock.method(
      backend.app.logic.encounterLifecycle,
      "onInitialize",
      async () => {},
    );
    await backend.app.logic.encounterLifecycle.initialize();
    assert.equal(initialize.mock.callCount(), 0);

    const response = await backend.fetch(
      "http://shadow.test/encounters/enc-1/start",
      { method: "POST" },
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
    assert.equal(network.mock.callCount(), 0);
  });

  it("rejects an already aborted request before Logic runs", async (context) => {
    const backend = await createTestBackend();
    context.after(() => backend.close());
    const start = context.mock.method(
      backend.app.logic.encounterLifecycle,
      "start",
      async () => {},
    );
    const reason = new Error("Cancelled by test");
    await assert.rejects(
      backend.fetch("http://shadow.test/encounters/enc-1/start", {
        method: "POST",
        signal: AbortSignal.abort(reason),
      }),
      (error) => error === reason,
    );
    assert.equal(start.mock.callCount(), 0);
  });
});
