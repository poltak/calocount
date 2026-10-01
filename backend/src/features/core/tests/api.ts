import { createHttpApp } from "../../../server/http-app.js";
import { createApp } from "./index.js";
import { createBrowserTransport } from "./browser-transport.js";
import { initializeLogic } from "../../../logic/lifecycle.js";

/** Node-only fixture: real handlers and validation, with no listening socket. */
export async function createTestBackend({
  baseUrl = "http://shadow.test",
  trustedOrigins = [],
}: { baseUrl?: string; trustedOrigins?: string[] } = {}) {
  const app = createApp({ authBaseUrl: baseUrl, trustedOrigins });
  try {
    await app.services.auth.migrate();
    await initializeLogic({ logic: app.logic });
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

  return {
    app,
    httpApp,
    fetch,
    createBrowserTransport: () =>
      createBrowserTransport({ fetch, origin: new URL(baseUrl).origin }),
    close: () => app.close(),
  };
}
