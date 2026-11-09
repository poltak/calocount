import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import type { AuthServiceInterface } from "../auth/services/types.js";
import type { AuthStorage } from "../auth/storage/auth-storage.js";
import type { AuthAccessLogic } from "../auth/logic/auth-access-logic.js";
import type { AuthPasswordResetLogic } from "../auth/logic/auth-password-reset-logic.js";
import type { AuthSessionLogic } from "../auth/logic/auth-session-logic.js";
import type { AuthSignUpLogic } from "../auth/logic/auth-sign-up-logic.js";
import type { OwnerSetupLogic } from "../auth/logic/owner-setup-logic.js";
import type { HealthLogic } from "../health/logic/health-logic.js";
import type { HealthStorage } from "../health/storage/health-storage.js";
import type { MigrationLogic } from "./logic/migration-logic.js";
import type { MigrationStorage } from "./storage/migration-storage.js";

export interface BackendStorage {
  auth: AuthStorage;
  health: HealthStorage;
  migration: MigrationStorage;
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
}

export interface BackendLogic {
  authAccess: AuthAccessLogic;
  authPasswordReset: AuthPasswordResetLogic;
  authSession: AuthSessionLogic;
  authSignUp: AuthSignUpLogic;
  ownerSetup: OwnerSetupLogic;
  health: HealthLogic;
  migration: MigrationLogic;
}

export interface App {
  storage: BackendStorage;
  services: BackendServices;
  logic: BackendLogic;
  /** Clean up Logic before releasing the database. */
  close(): Promise<void>;
}
