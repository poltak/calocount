import { createDatabase } from "../database/postgres-database.js";
import { AuthStorage } from "../features/auth/storage/auth-storage.js";
import { AuthAccessLogic } from "../features/auth/logic/auth-access-logic.js";
import { OwnerSetupLogic } from "../features/auth/logic/owner-setup-logic.js";
import {
  ownerEmail as parseOwnerEmail,
  readOwnerEmail,
} from "../features/auth/logic/configuration.js";
import { cleanupLogic } from "../logic/lifecycle.js";
import { LiveAIService } from "../features/ai/services/live-ai-service.js";
import { BetterAuthService } from "../features/auth/services/better-auth-service.js";
import {
  readAuthConfiguration,
  type AuthConfiguration,
} from "../features/auth/services/configuration.js";
import { EncounterLifecycleLogic } from "../features/encounter-lifecycle/logic/encounter-lifecycle-logic.js";
import { EncounterLifecycleStorage } from "../features/encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import { LivePatientRecordsService } from "../features/patient-records/services/live-patient-records-service.js";
import { LiveTranscriptionService } from "../features/transcription/services/live-transcription-service.js";
import type {
  App,
  BackendLogic,
  BackendServices,
  BackendStorage,
} from "../index.js";

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
  const storage: BackendStorage = {
    auth: new AuthStorage({ db }),
    encounterLifecycle: new EncounterLifecycleStorage({ db }),
  };
  const services: BackendServices = {
    auth: new BetterAuthService({ db, ...authConfiguration }),
    ai: new LiveAIService(),
    transcription: new LiveTranscriptionService(),
    patientRecords: new LivePatientRecordsService(),
  };

  const logic: BackendLogic = {
    authAccess: new AuthAccessLogic({
      storage: {},
      services: {},
      ownerEmail: configuredOwnerEmail,
    }),
    ownerSetup: new OwnerSetupLogic({
      storage,
      services,
      ownerEmail: configuredOwnerEmail,
    }),
    encounterLifecycle: new EncounterLifecycleLogic({ storage, services }),
  };

  return {
    storage,
    services,
    logic,
    async close() {
      try {
        await cleanupLogic({ logic });
      } finally {
        await db.destroy();
      }
    },
  };
}
