/* oxlint-disable no-unused-private-class-members -- Encounter queries will use the injected database. */

import type { BackendStorageProps } from "../../../storage/types.js";

/** Shared storage boundary for live and test database implementations. */
export class EncounterLifecycleStorage {
  constructor(private readonly deps: BackendStorageProps) {}
}
