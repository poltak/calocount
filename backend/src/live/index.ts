import { composeApp } from "../compose-app.js";
import { createDatabase } from "../database/postgres-database.js";
import { LiveAIService } from "../features/ai/services/live-ai-service.js";
import { BetterAuthService } from "../features/auth/services/better-auth-service.js";
import { LivePatientRecordsService } from "../features/patient-records/services/live-patient-records-service.js";
import { LiveTranscriptionService } from "../features/transcription/services/live-transcription-service.js";
import type { App } from "../index.js";
import { readLiveConfig, type LiveConfig } from "./config.js";

/** Compose one backend app with live dependencies. */
export function createApp({
  config = readLiveConfig(),
}: { config?: LiveConfig } = {}): App {
  const db = createDatabase({ connectionString: config.databaseUrl });
  return composeApp({
    db,
    ownerEmail: config.ownerEmail,
    services: {
      auth: new BetterAuthService({ db, ...config.auth }),
      ai: new LiveAIService(),
      transcription: new LiveTranscriptionService(),
      patientRecords: new LivePatientRecordsService(),
    },
  });
}
