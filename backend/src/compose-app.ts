import type { Database } from "./database/database.js";
import { AuthAccessLogic } from "./features/auth/logic/auth-access-logic.js";
import { OwnerSetupLogic } from "./features/auth/logic/owner-setup-logic.js";
import { AuthStorage } from "./features/auth/storage/auth-storage.js";
import { EncounterLifecycleLogic } from "./features/encounter-lifecycle/logic/encounter-lifecycle-logic.js";
import { EncounterLifecycleStorage } from "./features/encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import type {
  App,
  BackendLogic,
  BackendServices,
  BackendStorage,
} from "./index.js";
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
