import type { AIService } from "../ai/services/types.js";
import type { AuthService } from "../auth/services/types.js";
import type { AuthStorage } from "../auth/storage/auth-storage.js";
import type { AuthAccessLogic } from "../auth/logic/auth-access-logic.js";
import type { AuthSessionLogic } from "../auth/logic/auth-session-logic.js";
import type { OwnerSetupLogic } from "../auth/logic/owner-setup-logic.js";
import type { EncounterLifecycleLogic } from "../encounter-lifecycle/logic/encounter-lifecycle-logic.js";
import type { EncounterLifecycleStorage } from "../encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import type { PatientRecordsService } from "../patient-records/services/types.js";
import type { TranscriptionService } from "../transcription/services/types.js";

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
