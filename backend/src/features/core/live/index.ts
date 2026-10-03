import { ConsoleLoggerService } from "@shadow/common/features/core/services/console-logger-service";
import { composeApp } from "../compose-app.js";
import { createDatabase } from "../database/postgres-database.js";
import { PlaceholderAIService } from "../../ai/services/placeholder-ai-service.js";
import { BetterAuthService } from "../../auth/services/better-auth-service.js";
import { PlaceholderPatientRecordsService } from "../../patient-records/services/placeholder-patient-records-service.js";
import { PlaceholderTranscriptionService } from "../../transcription/services/placeholder-transcription-service.js";
import { JsonLoggerService } from "../services/json-logger-service.js";
import type { App } from "../types.js";
import { readLiveConfig, type LiveConfig } from "./config.js";

/** Compose one backend app with live dependencies. */
export function createApp({
  config = readLiveConfig(),
}: { config?: LiveConfig } = {}): App {
  const db = createDatabase({ connectionString: config.databaseUrl });
  const logger =
    config.log.format === "json"
      ? new JsonLoggerService({ minLevel: config.log.level })
      : new ConsoleLoggerService({ minLevel: config.log.level });
  return composeApp({
    db,
    ownerEmail: config.ownerEmail,
    services: {
      logger,
      auth: new BetterAuthService({ db, logger, ...config.auth }),
      ai: new PlaceholderAIService(),
      transcription: new PlaceholderTranscriptionService(),
      patientRecords: new PlaceholderPatientRecordsService(),
    },
  });
}
