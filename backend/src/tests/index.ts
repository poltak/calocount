import { Database } from "../database/in-memory/database.js";
import { AIService } from "../features/ai/services/fake-ai-service.js";
import { EncounterLifecycleStorage } from "../features/encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import { PatientRecordsService } from "../features/patient-records/services/fake-patient-records-service.js";
import { TranscriptionService } from "../features/transcription/services/fake-transcription-service.js";
import type { App, BackendServices, BackendStorage } from "../index.js";

/** Compose one backend app with isolated test dependencies. */
export function createApp(): App {
  const db = new Database();
  const storage: BackendStorage = {
    encounterLifecycle: new EncounterLifecycleStorage({ db }),
  };
  const services: BackendServices = {
    ai: new AIService(),
    transcription: new TranscriptionService(),
    patientRecords: new PatientRecordsService(),
  };

  return { storage, services };
}
