import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import type { AuthPasskeyLogic } from "../auth/logic/auth-passkey-logic.js";
import type { AuthPasskeyManageLogic } from "../auth/logic/auth-passkey-manage-logic.js";
import type { AuthSessionLogic } from "../auth/logic/auth-session-logic.js";
import type { PasskeyServiceInterface } from "../auth/services/types.js";
import type { AuthStorage } from "../auth/storage/auth-storage.js";
import type { HealthLogic } from "../health/logic/health-logic.js";
import type { HealthStorage } from "../health/storage/health-storage.js";
import type { RunAtomic } from "./logic/types.js";
import type { ClockServiceInterface } from "./services/types.js";

export interface BackendStorage {
  auth: AuthStorage;
  health: HealthStorage;
}

/**
 * Core Services. Any Service, Storage, or Logic class may depend on one. See
 * docs/agents/code-architecture.md (Class roles).
 */
interface BackendCoreServices {
  logger: LoggerServiceInterface;
  /** A Core Service, so that a test can move the time of the sessions. */
  clock: ClockServiceInterface;
}

export interface BackendServices extends BackendCoreServices {
  passkeys: PasskeyServiceInterface;
}

export interface BackendLogic {
  authPasskey: AuthPasskeyLogic;
  authPasskeyManage: AuthPasskeyManageLogic;
  authSession: AuthSessionLogic;
  health: HealthLogic;
}

/**
 * The settings of one deployment, as plain values. `core/live/config.ts` reads
 * them from the Worker's vars and secrets, and a test root sets them.
 */
export interface AppConfig {
  /**
   * The key of the owner's rows: passkeys, sessions, and later the data. The
   * old app keys its data by it, so the new app reads the same rows.
   */
  ownerKey: string;
  /** The code that saves a passkey without a session. An empty text is no code. */
  setupCode: string;
  /** Origins of a frontend on another origin. Only a test backend has any. */
  trustedOrigins: readonly string[];
}

export interface App {
  storage: BackendStorage;
  services: BackendServices;
  logic: BackendLogic;
  config: AppConfig;
  atomic: RunAtomic;
  /** Clean up Logic before releasing the database. */
  close(): Promise<void>;
}
