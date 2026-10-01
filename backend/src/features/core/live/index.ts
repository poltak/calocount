import { composeApp } from "../compose-app.js";
import { createDatabase } from "../database/postgres-database.js";
import { PlaceholderAIService } from "../../ai/services/placeholder-ai-service.js";
import { BetterAuthService } from "../../auth/services/better-auth-service.js";
import { PlaceholderPatientRecordsService } from "../../patient-records/services/placeholder-patient-records-service.js";
import { PlaceholderTranscriptionService } from "../../transcription/services/placeholder-transcription-service.js";
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
      auth: new BetterAuthService({ db, ...config.auth }),
      ai: new PlaceholderAIService(),
      transcription: new PlaceholderTranscriptionService(),
      patientRecords: new PlaceholderPatientRecordsService(),
    },
  });
}
