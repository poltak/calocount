import type { AIService } from "./features/ai/services/types.js";
import type { EncounterLifecycleStorage } from "./features/encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import type { PatientRecordsService } from "./features/patient-records/services/types.js";
import type { TranscriptionService } from "./features/transcription/services/types.js";

export interface BackendStorage {
  encounterLifecycle: EncounterLifecycleStorage;
}

export interface BackendServices {
  ai: AIService;
  transcription: TranscriptionService;
  patientRecords: PatientRecordsService;
}

export interface App {
  storage: BackendStorage;
  services: BackendServices;
}
