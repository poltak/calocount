import { createTestBackend } from "backend/testing";
import { onTestFinished } from "vitest";
import type { OwnedLogic } from "../logic/use-logic.js";
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

export type FullApplication = Awaited<ReturnType<typeof createFullApplication>>;

/** The test's own database, for reading and changing rows directly. */
export type TestDatabase = FullApplication["backend"]["db"];

export interface LogicTestParams extends FullApplicationParams {
  /** Leave the Logic uninitialized, for tests of initialization itself. */
  skipInitialization?: boolean;
}

/**
 * A full application plus the UI Logic under test, initialized unless the test
 * opts out. The Logic is cleaned up before the backend closes, so a test body
 * needs no teardown.
 */
export async function setupLogicTest<Instance extends OwnedLogic<object>>(
  { skipInitialization = false, ...applicationParams }: LogicTestParams,
  createLogic: (app: FullApplication) => Instance,
) {
  const app = await createFullApplication(applicationParams);
  const logic = createLogic(app);
  onTestFinished(() => logic.cleanup());
  if (!skipInitialization) {
    await logic.initialize();
  }
  return { ...app, logic };
}
