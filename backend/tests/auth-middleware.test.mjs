import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestBackend } from "../dist/tests/api.js";

const credentials = {
  email: "owner@example.test",
  name: "Owner",
  password: "test-password-for-auth-only",
};
function signIn(fetch) {
  return fetch("http://shadow.test/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials),
  });
}

describe("authentication middleware", () => {
  it("protects business routes while auth routes remain reachable", async (context) => {
    const backend = await createTestBackend();
    context.after(() => backend.close());
    const start = context.mock.method(
      backend.app.logic.encounterLifecycle,
      "start",
      async () => {},
    );
    const browser = backend.createBrowserTransport();
    for (const path of [
      "/api/encounters/enc-1/start",
      "/api/me",
      "/api/unknown-business-route",
    ]) {
      const response = await browser(`http://shadow.test${path}`, {
        method: path.includes("start") ? "POST" : "GET",
      });
      assert.equal(response.status, 401);
    }
    assert.equal(start.mock.callCount(), 0);
    const registration = await browser(
      "http://shadow.test/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(credentials),
      },
    );
    // The auth SDK's own endpoints are not exposed.
    assert.equal(registration.status, 401);

    const owner = await backend.app.services.auth.createAccount(credentials);
    assert.equal((await signIn(browser)).status, 200);
    assert.equal(
      (
        await browser("http://shadow.test/api/encounters/enc-1/start", {
          method: "POST",
        })
      ).status,
      204,
    );
    const me = await browser("http://shadow.test/api/me");
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), {
      user: { id: owner.id, email: owner.email, name: owner.name },
    });
    const csrf = await browser(
      "http://shadow.test/api/encounters/enc-1/start",
      {
        method: "POST",
        headers: { origin: "https://other.example" },
      },
    );
    assert.equal(csrf.status, 403);
    assert.equal(start.mock.callCount(), 1);

    assert.equal(
      (
        await browser("http://shadow.test/api/auth/sign-up/email", {
          method: "POST",
        })
      ).status,
      404,
    );

    assert.equal(
      (
        await browser("http://shadow.test/api/session", {
          method: "DELETE",
        })
      ).status,
      204,
    );
    assert.equal((await browser("http://shadow.test/api/me")).status, 401);
  });

  it("keeps separate browser sessions isolated", async (context) => {
    const backend = await createTestBackend();
    context.after(() => backend.close());
    await backend.app.services.auth.createAccount(credentials);
    const first = backend.createBrowserTransport();
    const second = backend.createBrowserTransport();
    assert.equal((await signIn(first)).status, 200);
    assert.equal((await second("http://shadow.test/api/me")).status, 401);
    assert.equal((await signIn(second)).status, 200);
    assert.equal(
      (await second("http://shadow.test/api/me", { credentials: "omit" }))
        .status,
      401,
    );
    await first("http://shadow.test/api/session", { method: "DELETE" });
    assert.equal((await first("http://shadow.test/api/me")).status, 401);
    assert.equal((await second("http://shadow.test/api/me")).status, 200);
  });

  it("rejects expired sessions and supports credentialed preflight", async (context) => {
    const backend = await createTestBackend();
    context.after(() => backend.close());
    const preflight = await backend.fetch(
      "http://shadow.test/api/encounters/enc-1/start",
      {
        method: "OPTIONS",
        headers: {
          origin: "http://shadow.test",
          "access-control-request-method": "POST",
        },
      },
    );
    assert.equal(preflight.status, 204);
    assert.equal(
      preflight.headers.get("access-control-allow-origin"),
      "http://shadow.test",
    );
    assert.equal(
      preflight.headers.get("access-control-allow-credentials"),
      "true",
    );
    await backend.app.services.auth.createAccount(credentials);
    const browser = backend.createBrowserTransport();
    await signIn(browser);
    await backend.app.db
      .updateTable("session")
      .set({ expiresAt: new Date(0) })
      .execute();
    assert.equal((await browser("http://shadow.test/api/me")).status, 401);
  });
});
