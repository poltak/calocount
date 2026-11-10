import { Kysely, type KyselyPlugin } from "kysely";
import type { AuthTables } from "../../auth/storage/types.js";
import type { EntriesTables } from "../../entries/storage/types.js";
import type { SettingsTables } from "../../settings/storage/types.js";
import type { WeightsTables } from "../../weights/storage/types.js";
import type { D1Binding } from "./d1-binding.js";
import { D1Dialect } from "./d1-dialect.js";
import { DatabaseNames } from "./database-names.js";
import type { AdoptedTable, BaseTable } from "./table-kinds.js";

/**
 * Every table in the database that the code uses. Add each feature's tables
 * here, declared in that feature's `storage/types.ts`.
 *
 * @public `pglite-database.ts` and `postgres-database.ts` read it until the
 * project takes over the PostgreSQL files (beads issue calocount-bcx.7.1).
 */
export interface DatabaseSchema
  extends AuthTables, EntriesTables, SettingsTables, WeightsTables {}

/** The tables that are not in `ADOPTED_TABLES` and lack the columns of `BaseTable`. */
type TablesWithoutStandardColumns = {
  [
    Name in Exclude<keyof DatabaseSchema, AdoptedTable>
  ]: DatabaseSchema[Name] extends BaseTable ? never : Name;
}[Exclude<keyof DatabaseSchema, AdoptedTable>];

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

/** A query builder around a binding. It opens nothing, so it is safe to keep for an isolate. */
export function createDatabase({
  binding,
  extraPlugins = [],
}: {
  binding: D1Binding;
  extraPlugins?: KyselyPlugin[];
}): Database {
  return new Kysely<DatabaseSchema>({
    dialect: new D1Dialect({ binding }),
    plugins: [new DatabaseNames(), ...extraPlugins],
  });
}
