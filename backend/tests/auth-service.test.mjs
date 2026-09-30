import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../dist/tests/index.js";
import { readAuthConfiguration } from "../dist/features/auth/services/configuration.js";

const credentials = {
  email: "owner@example.test",
  name: "Owner",
  password: "test-password-for-auth-only",
};

describe("AuthService", () => {
  it("requires explicit live configuration", () => {
    assert.throws(() => readAuthConfiguration({ env: {} }));
    assert.throws(() =>
      readAuthConfiguration({
        env: {
          BETTER_AUTH_SECRET: "short",
          BETTER_AUTH_URL: "http://localhost",
        },
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

    const signIn = await auth.handle(
      new Request("http://shadow.test/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://shadow.test",
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
        }),
      }),
    );
    assert.equal(signIn.status, 200);
    const cookie = signIn.headers
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

    const signOut = await auth.handle(
      new Request("http://shadow.test/api/auth/sign-out", {
        method: "POST",
        headers: { cookie, origin: "http://shadow.test" },
      }),
    );
    assert.equal(signOut.status, 200);
    assert.equal(await auth.getSession({ headers }), null);
  });

  it("rejects public registration and wrong passwords", async (context) => {
    const app = createApp();
    context.after(() => app.close());
    await app.services.auth.migrate();
    await app.services.auth.createAccount(credentials);
    const signup = await app.services.auth.handle(
      new Request("http://shadow.test/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://shadow.test",
        },
        body: JSON.stringify(credentials),
      }),
    );
    assert.equal(signup.status, 400);
    const invalid = await app.services.auth.handle(
      new Request("http://shadow.test/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://shadow.test",
        },
        body: JSON.stringify({
          email: credentials.email,
          password: "wrong-password",
        }),
      }),
    );
    assert.equal(invalid.status, 401);
  });
});
