import { createDatabase } from "../database/postgres-database.js";
import { AIService } from "../features/ai/services/ai-service.js";
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
}

/** Compose one backend app with live dependencies. */
export function createApp({
  databaseUrl = process.env.DATABASE_URL,
}: AppParams = {}): App {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to create a live backend app");
  }

  const db = createDatabase({ connectionString: databaseUrl });
  const storage: BackendStorage = {
    encounterLifecycle: new EncounterLifecycleStorage({ db }),
  };
  const services: BackendServices = {
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
