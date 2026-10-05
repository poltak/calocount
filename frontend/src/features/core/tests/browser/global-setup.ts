import { startTestBackendServer } from "backend/testing";
import { TEST_OWNER_CREDENTIALS } from "../test-owner.js";
import { BACKEND_PORT, FRONTEND_ORIGIN } from "./origins.js";

/**
 * Playwright runs this once, before the browser tests. It starts the test
 * backend in the test runner's process, and returns the function that stops
 * it after the last test.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const server = await startTestBackendServer({
    owner: TEST_OWNER_CREDENTIALS,
    port: BACKEND_PORT,
    trustedOrigins: [FRONTEND_ORIGIN],
  });
  return () => server.close();
}
