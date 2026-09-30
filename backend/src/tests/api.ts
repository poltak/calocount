import { createHttpApp } from "../server/http-app.js";
import { createApp } from "./index.js";

/** Node-only fixture: real handlers and validation, with no listening socket. */
export async function createTestBackend() {
  const app = createApp();
  try {
    await app.logic.encounterLifecycle.initialize();
  } catch (error) {
    await app.close();
    throw error;
  }

  const httpApp = createHttpApp({ app });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.signal.aborted) {
      throw request.signal.reason;
    }
    return httpApp.request(request);
  };

  return { app, httpApp, fetch, close: () => app.close() };
}
