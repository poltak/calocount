import type { Database } from "../database/database.js";

/** Dependencies shared by backend Storage classes. */
export interface BackendStorageProps {
  db: Database;
}
