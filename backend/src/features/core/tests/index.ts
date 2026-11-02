import { randomBytes } from "node:crypto";
import { MemoryLoggerService } from "@app/common/features/core/services/memory-logger-service";
import { composeApp } from "../compose-app.js";
import type { Database } from "../database/database.js";
import {
  createDatabase,
  createDatabaseSnapshot,
  type DatabaseSnapshot,
} from "../database/pglite-database.js";
import { BetterAuthService } from "../../auth/services/better-auth-service.js";
import type { AccountPolicy } from "../../auth/types.js";
import type { App, BackendServices } from "../types.js";

// `api.ts` comes from the template and takes the test database from here, so a
// project on another engine changes these exports and not `api.ts`.
export { createDatabase, createDatabaseSnapshot, type DatabaseSnapshot };

export interface TestApp extends App {
  db: Database;
  services: BackendServices & { logger: MemoryLoggerService };
}

export type AccountMode = AccountPolicy["mode"];

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
  return { ...app, db, services };
}
