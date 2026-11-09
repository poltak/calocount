import { randomBytes } from "node:crypto";
import { MemoryLoggerService } from "@app/common/features/core/services/memory-logger-service";
import { BetterAuthService } from "../../auth/services/better-auth-service.js";
import type { AuthUser } from "../../auth/services/types.js";
import type { AccountPolicy } from "../../auth/types.js";
import { composeApp } from "../compose-app.js";
import type { Database } from "../database/database.js";
import type { DatabaseMigration } from "../database/migration.js";
import { recordMigrationHash } from "../database/migration-hashes.js";
import { migrations } from "../database/migrations.js";
import {
  createDatabase,
  createDatabaseSnapshot,
  type DatabaseSnapshot,
} from "../database/pglite-database.js";
import { findStandardColumnProblems } from "../database/standard-columns.js";
import { createHttpApp } from "../server/http-app.js";
import type { App, BackendServices } from "../types.js";

// `api.ts` comes from the template, and takes the test database and the test
// sign-in from this file. So a project on another engine or sign-in method
// changes this file and not `api.ts`.
export { createDatabase, createDatabaseSnapshot, type DatabaseSnapshot };

export interface TestApp extends App {
  db: Database;
  services: BackendServices & { logger: MemoryLoggerService };
  /** For the tests of the schema and the migrations. See each function. */
  schemaTools: {
    findStandardColumnProblems: typeof findStandardColumnProblems;
    recordMigrationHash: typeof recordMigrationHash;
  };
  /** What a test gives `logic.migration.migrate`. */
  migrations: DatabaseMigration[];
}

export type AccountMode = AccountPolicy["mode"];

/** What `createTestOwner` and `signInTestOwner` need for the owner account. */
export interface TestOwnerCredentials {
  email: string;
  name: string;
  password: string;
}

export type TestOwner = AuthUser;

export function createApp({
  db,
  authBaseUrl = "http://app.test",
  trustedOrigins = [],
  accountMode = "singleOwner",
  secret = randomBytes(32).toString("base64"),
}: {
  db: Database;
  authBaseUrl?: string;
  trustedOrigins?: string[];
  accountMode?: AccountMode;
  /** The auth secret. A session cookie is valid only with the secret that signed it. */
  secret?: string;
}): TestApp {
  const accountPolicy: AccountPolicy =
    accountMode === "openSignUp"
      ? { mode: "openSignUp" }
      : { mode: "singleOwner", ownerEmail: "owner@example.test" };
  const logger = new MemoryLoggerService();
  const services = {
    logger,
    // The embedded auth framework runs for real against the isolated database.
    auth: new BetterAuthService({
      db,
      logger,
      secret,
      baseUrl: authBaseUrl,
      trustedOrigins,
      allowSignUp: accountPolicy.mode === "openSignUp",
    }),
  };
  const app = composeApp({ db, accountPolicy, services });
  return {
    ...app,
    db,
    services,
    schemaTools: { findStandardColumnProblems, recordMigrationHash },
    migrations,
  };
}

/** Give a new test database the schema of the application. */
export async function migrateTestDatabase({ app }: { app: TestApp }) {
  await app.logic.migration.migrate({ migrations: app.migrations });
}

/** Make the owner account in a test database that has the schema. */
export function createTestOwner({
  app,
  credentials,
}: {
  app: TestApp;
  credentials: TestOwnerCredentials;
}): Promise<TestOwner> {
  return app.logic.ownerSetup.createOwner(credentials);
}

/** Start a session for the owner. Returns the `Set-Cookie` values of that session. */
export async function signInTestOwner({
  app,
  owner,
  credentials,
}: {
  app: TestApp;
  owner: TestOwner;
  credentials: TestOwnerCredentials;
}): Promise<string[]> {
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
  return response.headers.getSetCookie();
}
