import { composeApp } from "../compose-app.js";
import { createDatabase } from "../database/postgres-database.js";
import { LiveAIService } from "../features/ai/services/live-ai-service.js";
import {
  ownerEmail as parseOwnerEmail,
  readOwnerEmail,
} from "../features/auth/logic/configuration.js";
import { BetterAuthService } from "../features/auth/services/better-auth-service.js";
import {
  readAuthConfiguration,
  type AuthConfiguration,
} from "../features/auth/services/configuration.js";
import { LivePatientRecordsService } from "../features/patient-records/services/live-patient-records-service.js";
import { LiveTranscriptionService } from "../features/transcription/services/live-transcription-service.js";
import type { App } from "../index.js";

export interface AppParams {
  /** Overrides DATABASE_URL when provided. */
  databaseUrl?: string;
  auth?: AuthConfiguration;
  ownerEmail?: string;
}

/** Compose one backend app with live dependencies. */
export function createApp({
  databaseUrl = process.env.DATABASE_URL,
  auth,
  ownerEmail,
}: AppParams = {}): App {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to create a live backend app");
  }

  const authConfiguration = auth ?? readAuthConfiguration();
  const configuredOwnerEmail =
    ownerEmail === undefined ? readOwnerEmail() : parseOwnerEmail(ownerEmail);
  const db = createDatabase({ connectionString: databaseUrl });
  return composeApp({
    db,
    ownerEmail: configuredOwnerEmail,
    services: {
      auth: new BetterAuthService({ db, ...authConfiguration }),
      ai: new LiveAIService(),
      transcription: new LiveTranscriptionService(),
      patientRecords: new LivePatientRecordsService(),
    },
  });
}
