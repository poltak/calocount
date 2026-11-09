import { AuthPasskeyLogic } from "../auth/logic/auth-passkey-logic.js";
import { AuthPasskeyManageLogic } from "../auth/logic/auth-passkey-manage-logic.js";
import { AuthSessionLogic } from "../auth/logic/auth-session-logic.js";
import { AuthStorage } from "../auth/storage/auth-storage.js";
import { BlackBoxLogic } from "../black-box/logic/black-box-logic.js";
import { BlackBoxStorage } from "../black-box/storage/black-box-storage.js";
import { HealthLogic } from "../health/logic/health-logic.js";
import { HealthStorage } from "../health/storage/health-storage.js";
import { createRunAtomic } from "./database/atomic.js";
import type { D1Binding } from "./database/d1-binding.js";
import type { Database } from "./database/database.js";
import { cleanupLogic } from "./logic/lifecycle.js";
import type {
  App,
  AppConfig,
  BackendLogic,
  BackendServices,
  BackendStorage,
} from "./types.js";

interface ComposeAppProps {
  binding: D1Binding;
  db: Database;
  services: BackendServices;
  config: AppConfig;
}

/** Every Storage class around one database. */
function createStorage(db: Database): BackendStorage {
  return {
    auth: new AuthStorage({ db }),
    blackBox: new BlackBoxStorage({ db }),
    health: new HealthStorage({ db }),
  };
}

/**
 * Build Storage and Logic around the database and Services chosen by the live
 * or test root. Both roots share this wiring so they cannot drift apart.
 */
export function composeApp({
  binding,
  db,
  services,
  config,
}: ComposeAppProps): App {
  const storage = createStorage(db);
  const atomic = createRunAtomic({ binding, storage });

  const logic: BackendLogic = {
    authPasskey: new AuthPasskeyLogic({ storage, services, atomic, config }),
    authPasskeyManage: new AuthPasskeyManageLogic({
      storage,
      services,
      atomic,
      config,
    }),
    authSession: new AuthSessionLogic({ storage, services, config }),
    blackBox: new BlackBoxLogic({ storage, services, atomic, config }),
    health: new HealthLogic({ storage, services }),
  };

  return {
    storage,
    services,
    logic,
    config,
    atomic,
    async close() {
      try {
        await cleanupLogic({ logic });
      } finally {
        await db.destroy();
      }
    },
  };
}
