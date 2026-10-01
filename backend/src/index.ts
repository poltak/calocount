import type { AIService } from "./features/ai/services/types.js";
import type { AuthService } from "./features/auth/services/types.js";
import type { AuthStorage } from "./features/auth/storage/auth-storage.js";
import type { AuthAccessLogic } from "./features/auth/logic/auth-access-logic.js";
import type { AuthSessionLogic } from "./features/auth/logic/auth-session-logic.js";
import type { OwnerSetupLogic } from "./features/auth/logic/owner-setup-logic.js";
import type { EncounterLifecycleLogic } from "./features/encounter-lifecycle/logic/encounter-lifecycle-logic.js";
import type { EncounterLifecycleStorage } from "./features/encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import type { PatientRecordsService } from "./features/patient-records/services/types.js";
import type { TranscriptionService } from "./features/transcription/services/types.js";

export interface BackendStorage {
  auth: AuthStorage;
  encounterLifecycle: EncounterLifecycleStorage;
}

export interface BackendServices {
  auth: AuthService;
  ai: AIService;
  transcription: TranscriptionService;
  patientRecords: PatientRecordsService;
}

export interface BackendLogic {
  authAccess: AuthAccessLogic;
  authSession: AuthSessionLogic;
  ownerSetup: OwnerSetupLogic;
  encounterLifecycle: EncounterLifecycleLogic;
}

export interface App {
  storage: BackendStorage;
  services: BackendServices;
  logic: BackendLogic;
  /** Clean up Logic before releasing the database. */
  close(): Promise<void>;
}
