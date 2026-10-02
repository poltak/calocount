import { createTestBackend } from "backend/testing";
import { onTestFinished } from "vitest";
import { createApp } from "./index.js";

export const TEST_OWNER_CREDENTIALS = {
  email: "owner@example.test",
  name: "Owner",
  password: "test-password-for-auth-only",
};

interface FullApplicationParams {
  /** Sign the owner in before the test starts. Defaults to true. */
  authenticated?: boolean;
}

/**
 * One isolated backend, database, and frontend app for the current test. No
 * server process or socket: frontend requests call the real Hono app. The
 * backend closes by itself when the test finishes.
 */
export async function createFullApplication({
  authenticated = true,
}: FullApplicationParams = {}) {
  const backend = await createTestBackend();
  onTestFinished(() => backend.close());
  const transport = backend.createBrowserTransport();
  const owner = await backend.app.logic.ownerSetup.createOwner(
    TEST_OWNER_CREDENTIALS,
  );
  if (authenticated) {
    const signIn = await transport.fetch("http://shadow.test/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(TEST_OWNER_CREDENTIALS),
    });
    if (!signIn.ok) {
      throw new Error("Test owner sign-in failed");
    }
  }
  return {
    frontend: createApp({ fetch: transport.fetch }),
    backend: backend.app,
    /** Controls for the requests the frontend sends. */
    transport,
    /** The owner account as the database holds it at the start of the test. */
    owner,
  };
}
