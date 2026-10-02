import { createHttpApp } from "../server/http-app.js";
import { createApp } from "./index.js";
import { createBrowserTransport } from "./browser-transport.js";
import { initializeLogic } from "../logic/lifecycle.js";
import {
  createDatabase,
  createDatabaseSnapshot,
  type DatabaseSnapshot,
} from "../database/pglite-database.js";
import type { AuthUser } from "../../auth/services/types.js";

interface OwnerCredentials {
  name: string;
  password: string;
}

interface Template {
  snapshot: DatabaseSnapshot;
  owner: AuthUser;
}

const templates = new Map<string, Promise<Template>>();

/**
 * A migrated database that already holds the owner account. Starting PGlite
 * empty and creating the owner takes most of a test's setup time, so this runs
 * once per test worker and every test database starts from its snapshot.
 */
async function createTemplate(
  credentials: OwnerCredentials,
): Promise<Template> {
  let owner!: AuthUser;
  const snapshot = await createDatabaseSnapshot(async (db) => {
    const app = createApp({ db });
    await app.services.auth.migrate();
    owner = await app.logic.ownerSetup.createOwner(credentials);
  });
  return { snapshot, owner };
}

/** Node-only fixture: real handlers and validation, with no listening socket. */
export async function createTestBackend({
  owner: credentials,
  baseUrl = "http://shadow.test",
  trustedOrigins = [],
}: {
  owner: OwnerCredentials;
  baseUrl?: string;
  trustedOrigins?: string[];
}) {
  const key = JSON.stringify([credentials.name, credentials.password]);
  if (!templates.has(key)) {
    templates.set(key, createTemplate(credentials));
  }
  const { snapshot, owner } = await templates.get(key)!;

  const app = createApp({
    db: createDatabase({ snapshot }),
    authBaseUrl: baseUrl,
    trustedOrigins,
  });
  try {
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
    /** The owner account as every test database holds it at the start. */
    owner,
    httpApp,
    fetch,
    createBrowserTransport: () =>
      createBrowserTransport({ fetch, origin: new URL(baseUrl).origin }),
    close: () => app.close(),
  };
}
