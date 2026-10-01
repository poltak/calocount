import { createDatabase } from "../database/pglite-database.js";
import { randomBytes } from "node:crypto";
import { BetterAuthService } from "../features/auth/services/better-auth-service.js";
import { AuthStorage } from "../features/auth/storage/auth-storage.js";
import { AuthAccessLogic } from "../features/auth/logic/auth-access-logic.js";
import { OwnerSetupLogic } from "../features/auth/logic/owner-setup-logic.js";
import { cleanupLogic } from "../logic/lifecycle.js";
import { FakeAIService } from "../features/ai/services/fake-ai-service.js";
import { EncounterLifecycleLogic } from "../features/encounter-lifecycle/logic/encounter-lifecycle-logic.js";
import { EncounterLifecycleStorage } from "../features/encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import { FakePatientRecordsService } from "../features/patient-records/services/fake-patient-records-service.js";
import { FakeTranscriptionService } from "../features/transcription/services/fake-transcription-service.js";
import type {
  App,
  BackendLogic,
  BackendServices,
  BackendStorage,
} from "../index.js";

/** Compose one backend app with isolated test dependencies. */
export function createApp({
  authBaseUrl = "http://shadow.test",
  trustedOrigins = [],
}: { authBaseUrl?: string; trustedOrigins?: string[] } = {}): App {
  const db = createDatabase();
  const storage: BackendStorage = {
    auth: new AuthStorage({ db }),
    encounterLifecycle: new EncounterLifecycleStorage({ db }),
  };
  const services: BackendServices = {
    auth: new BetterAuthService({
      db,
      secret: randomBytes(32).toString("base64"),
      baseUrl: authBaseUrl,
      trustedOrigins,
    }),
    ai: new FakeAIService(),
    transcription: new FakeTranscriptionService(),
    patientRecords: new FakePatientRecordsService(),
  };

  const logic: BackendLogic = {
    authAccess: new AuthAccessLogic({
      storage: {},
      services: {},
      ownerEmail: "owner@example.test",
    }),
    ownerSetup: new OwnerSetupLogic({
      storage,
      services,
      ownerEmail: "owner@example.test",
    }),
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
