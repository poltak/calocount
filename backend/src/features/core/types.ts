import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import type { ActivityStorage } from "../activity/storage/activity-storage.js";
import type { AIServiceInterface } from "../ai/services/types.js";
import type { AuthServiceInterface } from "../auth/services/types.js";
import type { AuthStorage } from "../auth/storage/auth-storage.js";
import type { AuthAccessLogic } from "../auth/logic/auth-access-logic.js";
import type { AuthProfileLogic } from "../auth/logic/auth-profile-logic.js";
import type { AuthSessionLogic } from "../auth/logic/auth-session-logic.js";
import type { AuthSignUpLogic } from "../auth/logic/auth-sign-up-logic.js";
import type { OwnerSetupLogic } from "../auth/logic/owner-setup-logic.js";
import type { EncounterLifecycleLogic } from "../encounter-lifecycle/logic/encounter-lifecycle-logic.js";
import type { EncounterLifecycleStorage } from "../encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import type { HealthLogic } from "../health/logic/health-logic.js";
import type { HealthStorage } from "../health/storage/health-storage.js";
import type { NotesLogic } from "../notes/logic/notes-logic.js";
import type { NotesStorage } from "../notes/storage/notes-storage.js";
import type { PatientRecordsServiceInterface } from "../patient-records/services/types.js";
import type { TranscriptionServiceInterface } from "../transcription/services/types.js";
import type { MigrationLogic } from "./logic/migration-logic.js";
import type { MigrationStorage } from "./storage/migration-storage.js";

export interface BackendStorage {
  activity: ActivityStorage;
  auth: AuthStorage;
  encounterLifecycle: EncounterLifecycleStorage;
  health: HealthStorage;
  migration: MigrationStorage;
  notes: NotesStorage;
}

/**
 * Core Services. Any Service, Storage, or Logic class may depend on one. See
 * docs/agents/code-architecture.md (Class roles).
 */
interface BackendCoreServices {
  logger: LoggerServiceInterface;
}

export interface BackendServices extends BackendCoreServices {
  auth: AuthServiceInterface;
  ai: AIServiceInterface;
  transcription: TranscriptionServiceInterface;
  patientRecords: PatientRecordsServiceInterface;
}

export interface BackendLogic {
  authAccess: AuthAccessLogic;
  authProfile: AuthProfileLogic;
  authSession: AuthSessionLogic;
  authSignUp: AuthSignUpLogic;
  ownerSetup: OwnerSetupLogic;
  encounterLifecycle: EncounterLifecycleLogic;
  health: HealthLogic;
  migration: MigrationLogic;
  notes: NotesLogic;
}

export interface App {
  storage: BackendStorage;
  services: BackendServices;
  logic: BackendLogic;
  /** Clean up Logic before releasing the database. */
  close(): Promise<void>;
}
