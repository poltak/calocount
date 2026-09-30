import { createTestBackend } from "backend/testing";
import { createApp } from "../../src/tests/index.js";

/** No server process or socket. Frontend requests call the real Hono app. */
export async function createFullApplication() {
  const backend = await createTestBackend();
  const frontend = createApp({ fetch: backend.fetch });
  return {
    frontend,
    backend: backend.app,
    httpApp: backend.httpApp,
    close: backend.close,
  };
}
