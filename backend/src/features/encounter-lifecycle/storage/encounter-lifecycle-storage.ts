import type { BackendStorageProps } from "../../../storage/types.js";

/** Shared storage boundary for live and test database implementations. */
export class EncounterLifecycleStorage {
  constructor(readonly props: BackendStorageProps) {}
}
