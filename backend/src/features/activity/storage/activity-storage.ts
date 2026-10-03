import type { BackendStorageProps } from "../../core/storage/types.js";

/**
 * A record of what each user changed. Another feature's Logic writes to it in
 * the transaction that makes the change, so the record and the change cannot
 * differ.
 */
export class ActivityStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  async record(activity: {
    userId: string;
    action: string;
    subjectId: string;
  }): Promise<void> {
    await this.deps.db.insertInto("activity").values(activity).execute();
  }
}
