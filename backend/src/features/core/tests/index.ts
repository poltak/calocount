import { randomBytes } from "node:crypto";
import { composeApp } from "../compose-app.js";
import type { Database } from "../database/database.js";
import { createDatabase } from "../database/pglite-database.js";
import { FakeAIService } from "../../ai/services/fake-ai-service.js";
import { BetterAuthService } from "../../auth/services/better-auth-service.js";
import { FakePatientRecordsService } from "../../patient-records/services/fake-patient-records-service.js";
import { FakeTranscriptionService } from "../../transcription/services/fake-transcription-service.js";
import type { App } from "../types.js";

/** Tests may inspect the isolated database directly. */
export interface TestApp extends App {
  db: Database;
}

/** Compose one backend app with isolated test dependencies. */
export function createApp({
  authBaseUrl = "http://shadow.test",
  trustedOrigins = [],
}: { authBaseUrl?: string; trustedOrigins?: string[] } = {}): TestApp {
  const db = createDatabase();
  const app = composeApp({
    db,
    ownerEmail: "owner@example.test",
    services: {
      // The embedded auth framework runs for real against the isolated database.
      auth: new BetterAuthService({
        db,
        secret: randomBytes(32).toString("base64"),
        baseUrl: authBaseUrl,
        trustedOrigins,
      }),
      ai: new FakeAIService(),
      transcription: new FakeTranscriptionService(),
      patientRecords: new FakePatientRecordsService(),
    },
  });
  return { ...app, db };
}
