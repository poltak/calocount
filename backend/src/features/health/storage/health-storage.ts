import { sql } from "kysely";
import type { BackendStorageProps } from "../../core/storage/types.js";

/** Checks that the database answers. It reads and writes no application data. */
export class HealthStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  async ping(): Promise<void> {
    await sql`select 1`.execute(this.deps.db);
  }
}
