import type { Database } from "./database/database.js";
import { AuthAccessLogic } from "../auth/logic/auth-access-logic.js";
import { AuthProfileLogic } from "../auth/logic/auth-profile-logic.js";
import { AuthSessionLogic } from "../auth/logic/auth-session-logic.js";
import { OwnerSetupLogic } from "../auth/logic/owner-setup-logic.js";
import { AuthStorage } from "../auth/storage/auth-storage.js";
import { EncounterLifecycleLogic } from "../encounter-lifecycle/logic/encounter-lifecycle-logic.js";
import { EncounterLifecycleStorage } from "../encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import type {
  App,
  BackendLogic,
  BackendServices,
  BackendStorage,
} from "./types.js";
import { cleanupLogic } from "./logic/lifecycle.js";

interface ComposeAppProps {
  db: Database;
  services: BackendServices;
  ownerEmail: string;
}

/**
 * Build Storage and Logic around the database and Services chosen by the live
 * or test root. Both roots share this wiring so they cannot drift apart.
 */
export function composeApp({ db, services, ownerEmail }: ComposeAppProps): App {
  const storage: BackendStorage = {
    auth: new AuthStorage({ db }),
    encounterLifecycle: new EncounterLifecycleStorage({ db }),
  };

  const logic: BackendLogic = {
    authAccess: new AuthAccessLogic({ storage: {}, services: {}, ownerEmail }),
    authProfile: new AuthProfileLogic({ storage: {}, services }),
    authSession: new AuthSessionLogic({ storage: {}, services }),
    ownerSetup: new OwnerSetupLogic({ storage, services, ownerEmail }),
    encounterLifecycle: new EncounterLifecycleLogic({ storage, services }),
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
