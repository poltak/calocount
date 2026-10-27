import { randomBytes } from "node:crypto";
import { serve, type ServerType } from "@hono/node-server";
import { createHttpApp } from "../server/http-app.js";
import { createApp, type AccountMode, type TestApp } from "./index.js";
import { createBrowserTransport } from "./browser-transport.js";
import { cleanupLogic, initializeLogic } from "../logic/lifecycle.js";
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
  /**
   * The auth secret of every backend that starts from the template. The
   * session cookies in `signedIn` are valid only with it.
   */
  secret: string;
  /**
   * The same database after the owner signed in, and the `Set-Cookie` values
   * of that session.
   */
  signedIn: { snapshot: ArrayBuffer; setCookies: string[] };
}

/**
 * Build the database that every test database starts from. Starting PGlite
 * empty, migrating it, and creating the owner takes several seconds, so a test
 * run does this once, before its test files start. The owner also signs in
 * here once, because a sign-in hashes the password, which took about a fifth
 * of each test that starts signed in.
 */
export async function createDatabaseTemplate(
  credentials: OwnerCredentials,
): Promise<DatabaseTemplate> {
  const secret = randomBytes(32).toString("base64");
  let owner!: AuthUser;
  const snapshot = await createDatabaseSnapshot({
    prepare: async (db) => {
      const app = createApp({ db, secret });
      await app.logic.migration.migrate();
      owner = await app.logic.ownerSetup.createOwner(credentials);
    },
  });
  let setCookies: string[] = [];
  const signedInSnapshot = await createDatabaseSnapshot({
    from: snapshot,
    prepare: async (db) => {
      const app = createApp({ db, secret });
      await initializeLogic({ logic: app.logic });
      try {
        const response = await createHttpApp({ app }).request(
          "http://app.test/api/session",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin: "http://app.test",
            },
            body: JSON.stringify({
              email: owner.email,
              password: credentials.password,
            }),
          },
        );
        if (!response.ok) {
          throw new Error(`Template owner sign-in failed: ${response.status}`);
        }
        setCookies = response.headers.getSetCookie();
      } finally {
        await cleanupLogic({ logic: app.logic });
      }
    },
  });
  return {
    snapshot: await snapshot.arrayBuffer(),
    owner,
    secret,
    signedIn: { snapshot: await signedInSnapshot.arrayBuffer(), setCookies },
  };
}

/**
 * The inputs of the project's test app that a test can set. The fixture sets
 * the other inputs itself.
 */
export type TestAppOptions = Omit<
  NonNullable<Parameters<typeof createApp>[0]>,
  "db" | "authBaseUrl" | "trustedOrigins" | "accountMode" | "secret"
>;

/** Node-only fixture: real handlers and validation, with no listening socket. */
export async function createTestBackend({
  template,
  signedIn = false,
  baseUrl = "http://app.test",
  trustedOrigins = [],
  accountMode = "singleOwner",
  backendOptions = {},
}: {
  template: DatabaseTemplate;
  /**
   * Start from the database in which the owner signed in. Each browser
   * transport of the backend then has the cookies of that session.
   */
  signedIn?: boolean;
  baseUrl?: string;
  trustedOrigins?: string[];
  /**
   * Who can have an account. In `openSignUp` mode, the owner in the template
   * is one user among others.
   */
  accountMode?: AccountMode;
  /**
   * Inputs of the project's test app, which `createApp` in `tests/index.ts`
   * takes, such as a setting that only some tests turn on.
   */
  backendOptions?: TestAppOptions;
}) {
  const snapshot = signedIn ? template.signedIn.snapshot : template.snapshot;
  const app = createApp({
    ...backendOptions,
    db: createDatabase({
      snapshot: new Blob([snapshot], { type: "application/x-tar" }),
    }),
    authBaseUrl: baseUrl,
    trustedOrigins,
    accountMode,
    secret: template.secret,
  });
  const restarted: TestApp[] = [];
  try {
    await initializeLogic({ logic: app.logic });
    // The database opens at the first query, and closing a database that is
    // not open yet has no effect. A test that closes the database, to see what
    // fails then, needs it open.
    await app.logic.health.checkReadiness();
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
      createBrowserTransport({
        fetch,
        origin: new URL(baseUrl).origin,
        setCookies: signedIn ? template.signedIn.setCookies : [],
      }),
    /**
     * Start the backend again on the same database, as a restart of the
     * server does. The new backend has new Services, and no request reaches
     * it.
     */
    restart: async () => {
      const again = createApp({
        ...backendOptions,
        db: app.db,
        authBaseUrl: baseUrl,
        trustedOrigins,
        accountMode,
        secret: template.secret,
      });
      restarted.push(again);
      await initializeLogic({ logic: again.logic });
      return again;
    },
    close: async () => {
      // The restarted backends share the database, so only `app` closes it.
      for (const again of restarted) {
        await cleanupLogic({ logic: again.logic });
      }
      await app.close();
    },
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
