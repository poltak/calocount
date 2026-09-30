import { createTestBackend } from "backend/testing";
import { createApp } from "../../src/tests/index.js";

/** No server process or socket. Frontend requests call the real Hono app. */
export async function createFullApplication() {
  const backend = await createTestBackend();
  const fetch = backend.createBrowserTransport();
  const credentials = {
    email: "owner@example.test",
    name: "Owner",
    password: "test-password-for-auth-only",
  };
  try {
    await backend.app.logic.ownerSetup.createOwner(credentials);
    const signIn = await fetch("http://shadow.test/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials),
    });
    if (!signIn.ok) throw new Error("Test owner sign-in failed");
  } catch (error) {
    await backend.close();
    throw error;
  }
  const frontend = createApp({ fetch });
  return {
    frontend,
    backend: backend.app,
    httpApp: backend.httpApp,
    close: backend.close,
  };
}
