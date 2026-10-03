import { createHttpApp } from "../server/http-app.js";
import { createApp } from "./index.js";
import { createBrowserTransport } from "./browser-transport.js";
import { initializeLogic } from "../logic/lifecycle.js";
import {
  createDatabase,
  createDatabaseSnapshot,
} from "../database/pglite-database.js";
import type { AuthUser } from "../../auth/services/types.js";

interface OwnerCredentials {
  name: string;
  password: string;
}

/**
 * A migrated database that already holds the owner account, as plain data that
 * the test runner can hand to each test file.
 */
export interface DatabaseTemplate {
  snapshot: ArrayBuffer;
  /** The owner account as the template holds it. */
  owner: AuthUser;
}

/**
 * Build the database that every test database starts from. Starting PGlite
 * empty, migrating it, and creating the owner takes several seconds, so a test
 * run does this once, before its test files start.
 */
export async function createDatabaseTemplate(
  credentials: OwnerCredentials,
): Promise<DatabaseTemplate> {
  let owner!: AuthUser;
  const snapshot = await createDatabaseSnapshot(async (db) => {
    const app = createApp({ db });
    await app.logic.migration.migrate();
    owner = await app.logic.ownerSetup.createOwner(credentials);
  });
  return { snapshot: await snapshot.arrayBuffer(), owner };
}

/** Node-only fixture: real handlers and validation, with no listening socket. */
export async function createTestBackend({
  template,
  baseUrl = "http://shadow.test",
  trustedOrigins = [],
}: {
  template: DatabaseTemplate;
  baseUrl?: string;
  trustedOrigins?: string[];
}) {
  const app = createApp({
    db: createDatabase({
      snapshot: new Blob([template.snapshot], { type: "application/x-tar" }),
    }),
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
    owner: template.owner,
    httpApp,
    fetch,
    createBrowserTransport: () =>
      createBrowserTransport({ fetch, origin: new URL(baseUrl).origin }),
    close: () => app.close(),
  };
}
