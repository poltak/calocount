import type { Kysely } from "kysely";
import type { ActivityTables } from "../../activity/storage/types.js";
import type { AuthTables } from "../../auth/storage/types.js";
import type { NotesTables } from "../../notes/storage/types.js";
import type {
  APPEND_ONLY_TABLES,
  AppendOnlyTable,
  BaseTable,
  SDK_TABLES,
} from "./standard-columns.js";

/**
 * Every table in the database. Add each feature's tables here, declared in
 * that feature's `storage/types.ts`.
 */
export interface DatabaseSchema
  extends ActivityTables, AuthTables, NotesTables {}

type ApplicationTableName = Exclude<
  keyof DatabaseSchema,
  (typeof SDK_TABLES)[number]
>;

/**
 * The names of the application tables whose type lacks the standard columns:
 * `BaseTable`, or `AppendOnlyTable` for a table in `APPEND_ONLY_TABLES`.
 */
type TablesWithoutStandardColumns = {
  [Name in ApplicationTableName]: DatabaseSchema[Name] extends (
    Name extends (typeof APPEND_ONLY_TABLES)[number]
      ? AppendOnlyTable
      : BaseTable
  )
    ? never
    : Name;
}[ApplicationTableName];

/** Compiles only when the first argument is `never`. The error shows what it is. */
type WhenNone<_Problem extends never, Result> = Result;

/**
 * The same query builder type is used by live and test storage.
 *
 * An error on this line names a table that does not have the standard
 * columns. Make its type extend `BaseTable`.
 */
export type Database = WhenNone<
  TablesWithoutStandardColumns,
  Kysely<DatabaseSchema>
>;
