import { composeApp } from "../compose-app.js";
import { createDatabase } from "../database/postgres-database.js";
import { LiveAIService } from "../../ai/services/live-ai-service.js";
import { LiveAuthService } from "../../auth/services/live-auth-service.js";
import { LivePatientRecordsService } from "../../patient-records/services/live-patient-records-service.js";
import { LiveTranscriptionService } from "../../transcription/services/live-transcription-service.js";
import type { App } from "../types.js";
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
      auth: new LiveAuthService({ db, ...config.auth }),
      ai: new LiveAIService(),
      transcription: new LiveTranscriptionService(),
      patientRecords: new LivePatientRecordsService(),
    },
  });
}
