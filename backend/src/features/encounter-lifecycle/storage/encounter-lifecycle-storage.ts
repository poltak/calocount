import type { Database } from "../../../database/database.js";

export interface EncounterLifecycleStorageProps {
  db: Database;
}

/** Shared storage boundary for live and test database implementations. */
export class EncounterLifecycleStorage {
  constructor(readonly props: EncounterLifecycleStorageProps) {}
}
