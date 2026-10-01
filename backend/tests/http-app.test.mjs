import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHttpApp } from "../dist/server/http-app.js";
import { createApp } from "../dist/tests/index.js";

function createFixture(context) {
  const app = createApp();
  // Handler unit tests use a verified caller; integration tests exercise real cookies.
  context.mock.method(app.services.auth, "getSession", async () => ({
    user: { id: "test-owner", email: "owner@example.test", name: "Owner" },
    session: {
      id: "test-session",
      userId: "test-owner",
      expiresAt: new Date("2099-01-01"),
    },
  }));
  context.after(() => app.close());
  return { app, httpApp: createHttpApp({ app }) };
}

describe("encounter lifecycle HTTP handlers", () => {
  for (const operation of ["start", "pause", "stop"]) {
    it(`${operation} delegates to the composed Logic instance`, async (context) => {
      const { app, httpApp } = createFixture(context);
      const calls = [];
      context.mock.method(
        app.logic.encounterLifecycle,
        operation,
        async (params) => {
          calls.push(params);
        },
      );

      const first = await httpApp.request(
        `/api/encounters/enc-1/${operation}`,
        {
          method: "POST",
        },
      );
      const second = await httpApp.request(
        `/api/encounters/enc-2/${operation}`,
        {
          method: "POST",
        },
      );

      assert.equal(first.status, 204);
      assert.equal(second.status, 204);
      assert.equal(await first.text(), "");
      assert.deepEqual(calls, [
        { encounterId: "enc-1" },
        { encounterId: "enc-2" },
      ]);
    });

    it(`${operation} returns 501 while Logic is a stub`, async (context) => {
      const { app, httpApp } = createFixture(context);
      const response = await httpApp.request(
        `/api/encounters/enc-1/${operation}`,
        {
          method: "POST",
        },
      );

      assert.equal(response.status, 501);
      assert.deepEqual(await response.json(), {
        error: {
          code: "NOT_IMPLEMENTED",
          message: "Encounter lifecycle operations are not implemented yet",
        },
      });
      assert.deepEqual(app.logic.encounterLifecycle.state, {});
    });

    it(`${operation} rejects an invalid ID before Logic runs`, async (context) => {
      const { app, httpApp } = createFixture(context);
      const method = context.mock.method(
        app.logic.encounterLifecycle,
        operation,
        async () => {},
      );

      const response = await httpApp.request(
        `/api/encounters/%20/${operation}`,
        {
          method: "POST",
        },
      );

      assert.equal(response.status, 400);
      assert.equal(method.mock.callCount(), 0);
    });
  }

  it("leaves unknown routes and unsupported methods unhandled", async (context) => {
    const { httpApp } = createFixture(context);
    const unknown = await httpApp.request("/api/encounters/enc-1/resume", {
      method: "POST",
    });
    const wrongMethod = await httpApp.request("/api/encounters/enc-1/start");

    assert.equal(unknown.status, 404);
    assert.equal(wrongMethod.status, 404);
  });
});
