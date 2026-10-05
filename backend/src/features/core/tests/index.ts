import { randomBytes } from "node:crypto";
import { MemoryLoggerService } from "@app/common/features/core/services/memory-logger-service";
import { composeApp } from "../compose-app.js";
import type { Database } from "../database/database.js";
import { createDatabase } from "../database/pglite-database.js";
import { FakeAIService } from "../../ai/services/fake-ai-service.js";
import { BetterAuthService } from "../../auth/services/better-auth-service.js";
import { FakePatientRecordsService } from "../../patient-records/services/fake-patient-records-service.js";
import { FakeTranscriptionService } from "../../transcription/services/fake-transcription-service.js";
import type { App, BackendServices } from "../types.js";

/** Tests may inspect the isolated database and the logged entries directly. */
export interface TestApp extends App {
  db: Database;
  services: BackendServices & { logger: MemoryLoggerService };
}

/** Compose one backend app with isolated test dependencies. */
export function createApp({
  db = createDatabase(),
  authBaseUrl = "http://app.test",
  trustedOrigins = [],
}: {
  db?: Database;
  authBaseUrl?: string;
  trustedOrigins?: string[];
} = {}): TestApp {
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
    }),
    ai: new FakeAIService(),
    transcription: new FakeTranscriptionService(),
    patientRecords: new FakePatientRecordsService(),
  };
  const app = composeApp({ db, ownerEmail: "owner@example.test", services });
  return { ...app, db, services };
}
