import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestBackend } from "../dist/tests/api.js";
import {
  ownerEmail,
  readOwnerEmail,
} from "../dist/features/auth/logic/configuration.js";

const credentials = { name: "Owner", password: "test-password-for-auth-only" };

describe("single-user setup", () => {
  it("permits only one account during concurrent owner setup", async (context) => {
    const backend = await createTestBackend();
    context.after(() => backend.close());
    context.mock.method(console, "error", () => {});
    const attempts = await Promise.allSettled([
      backend.app.logic.ownerSetup.createOwner(credentials),
      backend.app.logic.ownerSetup.createOwner(credentials),
    ]);
    assert.equal(
      attempts.filter((attempt) => attempt.status === "fulfilled").length,
      1,
    );
    assert.equal(await backend.app.storage.auth.getUserCount(), 1);
  });
  it("requires a valid owner email and normalizes it", () => {
    assert.throws(() => readOwnerEmail({ env: {} }));
    assert.throws(() => ownerEmail("not-an-email"));
    assert.equal(ownerEmail(" OWNER@EXAMPLE.TEST "), "owner@example.test");
  });

  it("provisions the configured owner once without replacing credentials", async (context) => {
    const backend = await createTestBackend();
    context.after(() => backend.close());
    const owner = await backend.app.logic.ownerSetup.createOwner(credentials);
    assert.equal(owner.email, "owner@example.test");
    assert.equal(await backend.app.storage.auth.getUserCount(), 1);
    await assert.rejects(
      backend.app.logic.ownerSetup.createOwner({
        ...credentials,
        password: "different-password",
      }),
      /already exists/,
    );
    const response = await backend.createBrowserTransport()(
      "http://shadow.test/api/auth/sign-in/email",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: owner.email,
          password: credentials.password,
        }),
      },
    );
    assert.equal(response.status, 200);
  });

  it("rejects a valid session for a different account", async (context) => {
    const backend = await createTestBackend();
    context.after(() => backend.close());
    await backend.app.logic.ownerSetup.createOwner(credentials);
    const other = { email: "other@example.test", ...credentials };
    // Trusted setup capability creates a second account only to prove admission policy.
    await backend.app.services.auth.createAccount(other);
    const browser = backend.createBrowserTransport();
    assert.equal(
      (
        await browser("http://shadow.test/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(other),
        })
      ).status,
      200,
    );
    const operation = context.mock.method(
      backend.app.logic.encounterLifecycle,
      "start",
      async () => {},
    );
    assert.equal((await browser("http://shadow.test/api/me")).status, 403);
    assert.equal(
      (
        await browser("http://shadow.test/encounters/enc-1/start", {
          method: "POST",
        })
      ).status,
      403,
    );
    assert.equal(operation.mock.callCount(), 0);
  });
});
