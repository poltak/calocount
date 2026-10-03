import type { Kysely } from "kysely";
import type { ActivityTables } from "../../activity/storage/types.js";
import type { AuthTables } from "../../auth/storage/types.js";
import type { NotesTables } from "../../notes/storage/types.js";

/**
 * Every table in the database. Add each feature's tables here, declared in
 * that feature's `storage/types.ts`.
 */
export interface DatabaseSchema
  extends ActivityTables, AuthTables, NotesTables {}

/** The same query builder type is used by live and test storage. */
export type Database = Kysely<DatabaseSchema>;
