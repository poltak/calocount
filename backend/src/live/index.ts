import { Database } from "../database/live/database.js";
import { AIService } from "../features/ai/services/ai-service.js";
import { EncounterLifecycleStorage } from "../features/encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import { PatientRecordsService } from "../features/patient-records/services/patient-records-service.js";
import { TranscriptionService } from "../features/transcription/services/transcription-service.js";
import type { App, BackendServices, BackendStorage } from "../index.js";

/** Compose one backend app with live dependencies. */
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
