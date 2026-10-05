import { randomBytes } from "node:crypto";
import { MemoryLoggerService } from "@app/common/features/core/services/memory-logger-service";
import { composeApp } from "../compose-app.js";
import type { Database } from "../database/database.js";
import { createDatabase } from "../database/pglite-database.js";
import { FakeAIService } from "../../ai/services/fake-ai-service.js";
import { BetterAuthService } from "../../auth/services/better-auth-service.js";
import type { AccountPolicy } from "../../auth/types.js";
import { FakePatientRecordsService } from "../../patient-records/services/fake-patient-records-service.js";
import { FakeTranscriptionService } from "../../transcription/services/fake-transcription-service.js";
import type { App, BackendServices } from "../types.js";

export interface TestApp extends App {
  db: Database;
  services: BackendServices & { logger: MemoryLoggerService };
}

export type AccountMode = AccountPolicy["mode"];

export function createApp({
  db = createDatabase(),
  authBaseUrl = "http://app.test",
  trustedOrigins = [],
  accountMode = "singleOwner",
}: {
  db?: Database;
  authBaseUrl?: string;
  trustedOrigins?: string[];
  accountMode?: AccountMode;
} = {}): TestApp {
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
      secret: randomBytes(32).toString("base64"),
      baseUrl: authBaseUrl,
      trustedOrigins,
      allowSignUp: accountPolicy.mode === "openSignUp",
    }),
    ai: new FakeAIService(),
    transcription: new FakeTranscriptionService(),
    patientRecords: new FakePatientRecordsService(),
  };
  const app = composeApp({ db, accountPolicy, services });
  return { ...app, db, services };
}
