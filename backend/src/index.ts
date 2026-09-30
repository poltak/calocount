import type { AIService } from "./features/ai/services/types.js";
import type { AuthService } from "./features/auth/services/types.js";
import type { EncounterLifecycleLogic } from "./features/encounter-lifecycle/logic/encounter-lifecycle-logic.js";
import type { EncounterLifecycleStorage } from "./features/encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import type { PatientRecordsService } from "./features/patient-records/services/types.js";
import type { TranscriptionService } from "./features/transcription/services/types.js";

export interface BackendStorage {
  encounterLifecycle: EncounterLifecycleStorage;
}

export interface BackendServices {
  auth: AuthService;
  ai: AIService;
  transcription: TranscriptionService;
  patientRecords: PatientRecordsService;
}

export interface BackendLogic {
  encounterLifecycle: EncounterLifecycleLogic;
}

export interface App {
  storage: BackendStorage;
  services: BackendServices;
  logic: BackendLogic;
  /** Clean up Logic before releasing the database. */
  close(): Promise<void>;
}
