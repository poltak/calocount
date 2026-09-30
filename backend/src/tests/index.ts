import { createDatabase } from "../database/pglite-database.js";
import { AIService } from "../features/ai/services/fake-ai-service.js";
import { EncounterLifecycleLogic } from "../features/encounter-lifecycle/logic/encounter-lifecycle-logic.js";
import { EncounterLifecycleStorage } from "../features/encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import { PatientRecordsService } from "../features/patient-records/services/fake-patient-records-service.js";
import { TranscriptionService } from "../features/transcription/services/fake-transcription-service.js";
import type {
  App,
  BackendLogic,
  BackendServices,
  BackendStorage,
} from "../index.js";

/** Compose one backend app with isolated test dependencies. */
export function createApp(): App {
  const db = createDatabase();
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
