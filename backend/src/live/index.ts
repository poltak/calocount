import { createDatabase } from "../database/postgres-database.js";
import { AIService } from "../features/ai/services/ai-service.js";
import { AuthService } from "../features/auth/services/auth-service.js";
import {
  readAuthConfiguration,
  type AuthConfiguration,
} from "../features/auth/services/configuration.js";
import { EncounterLifecycleLogic } from "../features/encounter-lifecycle/logic/encounter-lifecycle-logic.js";
import { EncounterLifecycleStorage } from "../features/encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import { PatientRecordsService } from "../features/patient-records/services/patient-records-service.js";
import { TranscriptionService } from "../features/transcription/services/transcription-service.js";
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
}

/** Compose one backend app with live dependencies. */
export function createApp({
  databaseUrl = process.env.DATABASE_URL,
  auth,
}: AppParams = {}): App {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to create a live backend app");
  }

  const authConfiguration = auth ?? readAuthConfiguration();
  const db = createDatabase({ connectionString: databaseUrl });
  const storage: BackendStorage = {
    encounterLifecycle: new EncounterLifecycleStorage({ db }),
  };
  const services: BackendServices = {
    auth: new AuthService({ db, ...authConfiguration }),
    ai: new AIService(),
    transcription: new TranscriptionService(),
    patientRecords: new PatientRecordsService(),
  };

  const logic: BackendLogic = {
    encounterLifecycle: new EncounterLifecycleLogic({ storage, services }),
  };

  return {
    storage,
    services,
    logic,
    async close() {
      try {
        await logic.encounterLifecycle.cleanup();
      } finally {
        await db.destroy();
      }
    },
  };
}
