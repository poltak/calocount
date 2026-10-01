import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../dist/tests/index.js";
import { authConfigurationSchema } from "../dist/features/auth/services/configuration.js";
import { readLiveConfig } from "../dist/live/config.js";

const credentials = {
  email: "owner@example.test",
  name: "Owner",
  password: "test-password-for-auth-only",
};

describe("AuthService", () => {
  it("requires explicit live configuration", () => {
    assert.throws(() => readLiveConfig({}));
    assert.throws(() =>
      authConfigurationSchema.parse({
        secret: "short",
        baseUrl: "http://localhost",
      }),
    );
  });

  it("creates isolated auth tables and runs real sign-in and sign-out", async (context) => {
    const app = createApp();
    context.after(() => app.close());
    const auth = app.services.auth;
    await auth.migrate();
    await auth.migrate();
    const user = await auth.createAccount(credentials);
    assert.equal(user.email, credentials.email);

    const requestHeaders = new Headers({ origin: "http://shadow.test" });
    const signIn = await auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
      requestHeaders,
    });
    assert.equal(signIn.ok, true);
    assert.deepEqual(signIn.user, {
      id: user.id,
      email: user.email,
      name: user.name,
    });
    const cookie = signIn.responseHeaders
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const headers = new Headers({ cookie });
    assert.equal((await auth.getSession({ headers })).user.id, user.id);
    assert.equal(await auth.getSession({ headers: new Headers() }), null);
    assert.equal(
      await auth.getSession({
        headers: new Headers({ cookie: "better-auth.session_token=invalid" }),
      }),
      null,
    );

    const signOut = await auth.signOut({
      requestHeaders: new Headers({ cookie, origin: "http://shadow.test" }),
    });
    assert.ok(signOut.responseHeaders.getSetCookie().length > 0);
    assert.equal(await auth.getSession({ headers }), null);
  });

  it("reports wrong passwords and untrusted origins without a session", async (context) => {
    const app = createApp();
    context.after(() => app.close());
    await app.services.auth.migrate();
    await app.services.auth.createAccount(credentials);
    const wrongPassword = await app.services.auth.signInWithPassword({
      email: credentials.email,
      password: "wrong-password",
      requestHeaders: new Headers({ origin: "http://shadow.test" }),
    });
    assert.deepEqual(wrongPassword, {
      ok: false,
      reason: "invalidCredentials",
    });
    const untrusted = await app.services.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
      requestHeaders: new Headers({ origin: "https://other.example" }),
    });
    assert.deepEqual(untrusted, { ok: false, reason: "untrustedOrigin" });
  });
});
