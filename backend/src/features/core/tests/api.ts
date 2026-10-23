import { serve, type ServerType } from "@hono/node-server";
import { createHttpApp } from "../server/http-app.js";
import { createApp, type AccountMode } from "./index.js";
import { createBrowserTransport } from "./browser-transport.js";
import { initializeLogic } from "../logic/lifecycle.js";
import {
  createDatabase,
  createDatabaseSnapshot,
} from "../database/pglite-database.js";
import type { AuthUser } from "../../auth/services/types.js";

// For the tests of the schema and the migrations. See each function.
export { findStandardColumnProblems } from "../database/standard-columns.js";
export { recordMigrationHash } from "../database/migration-hashes.js";

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
  baseUrl = "http://app.test",
  trustedOrigins = [],
  accountMode = "singleOwner",
}: {
  template: DatabaseTemplate;
  baseUrl?: string;
  trustedOrigins?: string[];
  /**
   * Who can have an account. In `openSignUp` mode, the owner in the template
   * is one user among others.
   */
  accountMode?: AccountMode;
}) {
  const app = createApp({
    db: createDatabase({
      snapshot: new Blob([template.snapshot], { type: "application/x-tar" }),
    }),
    authBaseUrl: baseUrl,
    trustedOrigins,
    accountMode,
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

/**
 * Node-only fixture for a test in a real browser, which needs a socket to
 * call. It is the same test backend, with one new database from the template,
 * on a port of this machine.
 */
export async function startTestBackendServer({
  template,
  port,
  trustedOrigins,
  accountMode = "singleOwner",
}: {
  template: DatabaseTemplate;
  port: number;
  trustedOrigins: string[];
  /** Who can have an account. Use the mode that the project runs in. */
  accountMode?: AccountMode;
}) {
  const hostname = "127.0.0.1";
  const backend = await createTestBackend({
    template,
    baseUrl: `http://${hostname}:${port}`,
    trustedOrigins,
    accountMode,
  });

  let server: ServerType;
  try {
    server = await new Promise<ServerType>((resolve, reject) => {
      const starting = serve(
        { fetch: backend.httpApp.fetch, hostname, port },
        () => resolve(starting),
      );
      // The usual cause is another process on the port.
      starting.once("error", reject);
    });
  } catch (error) {
    await backend.close();
    throw error;
  }

  return {
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        // A browser keeps its connections open, and `close` waits for them.
        if ("closeAllConnections" in server) {
          server.closeAllConnections();
        }
      });
      await backend.close();
    },
  };
}
