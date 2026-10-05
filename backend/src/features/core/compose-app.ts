import type { Database } from "./database/database.js";
import { ActivityStorage } from "../activity/storage/activity-storage.js";
import { AuthAccessLogic } from "../auth/logic/auth-access-logic.js";
import { AuthProfileLogic } from "../auth/logic/auth-profile-logic.js";
import { AuthSessionLogic } from "../auth/logic/auth-session-logic.js";
import { AuthSignUpLogic } from "../auth/logic/auth-sign-up-logic.js";
import { OwnerSetupLogic } from "../auth/logic/owner-setup-logic.js";
import { AuthStorage } from "../auth/storage/auth-storage.js";
import type { AccountPolicy } from "../auth/types.js";
import { HealthLogic } from "../health/logic/health-logic.js";
import { HealthStorage } from "../health/storage/health-storage.js";
import { NotesLogic } from "../notes/logic/notes-logic.js";
import { NotesStorage } from "../notes/storage/notes-storage.js";
import type {
  App,
  BackendLogic,
  BackendServices,
  BackendStorage,
} from "./types.js";
import { cleanupLogic } from "./logic/lifecycle.js";
import { MigrationLogic } from "./logic/migration-logic.js";
import type { RunTransaction } from "./logic/types.js";
import { MigrationStorage } from "./storage/migration-storage.js";

interface ComposeAppProps {
  db: Database;
  services: BackendServices;
  accountPolicy: AccountPolicy;
}

/** Every Storage class around one database, or around one transaction on it. */
function createStorage(db: Database): BackendStorage {
  return {
    activity: new ActivityStorage({ db }),
    auth: new AuthStorage({ db }),
    health: new HealthStorage({ db }),
    migration: new MigrationStorage({ db }),
    notes: new NotesStorage({ db }),
  };
}

/**
 * Build Storage and Logic around the database and Services chosen by the live
 * or test root. Both roots share this wiring so they cannot drift apart.
 */
export function composeApp({
  db,
  services,
  accountPolicy,
}: ComposeAppProps): App {
  const storage = createStorage(db);
  const transaction: RunTransaction = (run) =>
    db
      .transaction()
      .execute((transactionDb) => run(createStorage(transactionDb)));

  const logic: BackendLogic = {
    authAccess: new AuthAccessLogic({
      storage: {},
      services: {},
      accountPolicy,
    }),
    authProfile: new AuthProfileLogic({ storage: {}, services }),
    authSession: new AuthSessionLogic({ storage: {}, services }),
    authSignUp: new AuthSignUpLogic({ storage: {}, services, accountPolicy }),
    ownerSetup: new OwnerSetupLogic({ storage, services, accountPolicy }),
    health: new HealthLogic({ storage, services }),
    migration: new MigrationLogic({ storage, services }),
    notes: new NotesLogic({ storage, services, transaction }),
  };

  return {
    storage,
    services,
    logic,
    async close() {
      try {
        await cleanupLogic({ logic });
      } finally {
        await db.destroy();
      }
    },
  };
}
