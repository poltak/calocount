import { createTestBackend } from "backend/testing";
import { inject, onTestFinished } from "vitest";
import { AuthLogic } from "../../auth/ui/auth-logic.js";
import type { OwnedLogic } from "../logic/use-logic.js";
import { createApp } from "./index.js";
import { TEST_OWNER_CREDENTIALS } from "./test-owner.js";

interface FullApplicationParams {
  /** Sign the owner in before the test starts. Defaults to true. */
  authenticated?: boolean;
  /**
   * Who can have an account. Defaults to `singleOwner`. In `openSignUp` mode,
   * a visitor can sign up, and the owner is one user among others.
   */
  accountMode?: "singleOwner" | "openSignUp";
}

/**
 * One isolated backend, database, and frontend app for the current test. No
 * server process or socket: frontend requests call the real Hono app. The
 * backend closes by itself when the test finishes.
 */
export async function createFullApplication({
  authenticated = true,
  accountMode = "singleOwner",
}: FullApplicationParams = {}) {
  // `global-setup.ts` built the template once for the whole test run.
  const backend = await createTestBackend({
    template: inject("databaseTemplate"),
    accountMode,
  });
  onTestFinished(() => backend.close());
  const transport = backend.createBrowserTransport();
  if (authenticated) {
    const signIn = await transport.fetch("http://app.test/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(TEST_OWNER_CREDENTIALS),
    });
    if (!signIn.ok) {
      throw new Error("Test owner sign-in failed");
    }
  }
  const frontend = createApp({ fetch: transport.fetch });
  // In a browser, the auth provider owns this Logic for the life of the app.
  const auth = new AuthLogic(frontend);
  onTestFinished(() => auth.cleanup());
  return {
    frontend,
    /**
     * The session's Logic. A Logic under test takes its `events` in `deps`.
     * It is not initialized. A test that needs it to act, for example to sign
     * out, initializes it first.
     */
    auth,
    backend: backend.app,
    transport,
    /** The owner account as the database holds it at the start of the test. */
    owner: backend.owner,
  };
}

export type FullApplication = Awaited<ReturnType<typeof createFullApplication>>;

export type TestDatabase = FullApplication["backend"]["db"];

export interface LogicTestParams extends FullApplicationParams {
  /** Leave the Logic uninitialized, for tests of initialization itself. */
  skipInitialization?: boolean;
}

/**
 * A full application plus the UI Logic under test, initialized unless the test
 * opts out. The Logic is cleaned up before the backend closes, so a test body
 * needs no teardown.
 *
 * `createLogic` can be async, to first seed what the Logic's `deps` name, such
 * as the record that a page opens.
 */
export async function setupLogicTest<Instance extends OwnedLogic<object>>(
  { skipInitialization = false, ...applicationParams }: LogicTestParams,
  createLogic: (app: FullApplication) => Instance | Promise<Instance>,
) {
  const app = await createFullApplication(applicationParams);
  const logic = await createLogic(app);
  onTestFinished(() => logic.cleanup());
  if (!skipInitialization) {
    await logic.initialize();
  }
  return { ...app, logic };
}
