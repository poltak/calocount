import { sql, type GeneratedAlways, type Kysely } from "kysely";
import {
  DEFAULT_MIGRATION_LOCK_TABLE,
  DEFAULT_MIGRATION_TABLE,
} from "kysely/migration";
import type { AuthTables } from "../../auth/storage/types.js";
import { DatabaseNames } from "./database-names.js";

/**
 * The columns that every application table has. The database makes all three
 * values, and code cannot set them: a default makes `id` and `createdAt`, and
 * a trigger sets `updatedAt` when a record changes.
 *
 * A feature's table type extends this one. `Database` does not compile when
 * an application table does not, and a test checks the real columns.
 */
export interface BaseTable {
  id: GeneratedAlways<string>;
  createdAt: GeneratedAlways<Date>;
  updatedAt: GeneratedAlways<Date>;
}

/**
 * For a table whose records never change after they are made, such as a log.
 * Such a table has no `updatedAt`, and its name must be in
 * `APPEND_ONLY_TABLES`.
 */
export type AppendOnlyTable = Omit<BaseTable, "updatedAt">;

/** Tables that the auth SDK creates. It owns their columns. */
export const SDK_TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "rateLimit",
] as const satisfies readonly (keyof AuthTables)[];

/** Application tables whose records never change. See `AppendOnlyTable`. */
export const APPEND_ONLY_TABLES = ["activity"] as const;

// The name in the database. A migration writes it in raw SQL.
const SET_UPDATED_AT_FUNCTION = "set_updated_at";

interface ColumnRow {
  table: string;
  column: string;
  type: string;
  isNullable: string;
  default: string | null;
}

/**
 * Compare the application tables in the database with the standard columns,
 * and describe each difference. An empty list means that every table is
 * correct. The types cannot see the SQL of a migration, so this reads what the
 * migrations made.
 */
export async function findStandardColumnProblems<Schema>(
  db: Kysely<Schema>,
): Promise<string[]> {
  const { rows: columns } = await sql<ColumnRow>`
    select
      table_name as "table",
      column_name as "column",
      data_type as "type",
      is_nullable as "isNullable",
      column_default as "default"
    from information_schema.columns
    where table_schema = current_schema()
    order by table_name, ordinal_position
  `.execute(db);
  const { rows: triggers } = await sql<{ table: string; condition: string }>`
    select
      event_object_table as "table",
      coalesce(action_condition, '') as "condition"
    from information_schema.triggers
    where trigger_schema = current_schema()
      and action_timing = 'BEFORE'
      and event_manipulation = 'UPDATE'
      and action_orientation = 'ROW'
      and action_statement like ${`%${SET_UPDATED_AT_FUNCTION.replaceAll("_", "\\_")}()`}
  `.execute(db);

  // The lists and the column names in this file are the TypeScript names. The
  // rows above have the names of the database.
  const names = new DatabaseNames();
  const exemptTables = new Set([
    ...SDK_TABLES.map((table) => names.inDatabase(table)),
    DEFAULT_MIGRATION_TABLE,
    DEFAULT_MIGRATION_LOCK_TABLE,
  ]);
  const appendOnlyTables = new Set(
    APPEND_ONLY_TABLES.map((table) => names.inDatabase(table)),
  );
  const createdAt = names.inDatabase("createdAt");
  const updatedAt = names.inDatabase("updatedAt");

  const problems: string[] = [];
  const tables = new Set(columns.map((column) => column.table));
  for (const table of tables) {
    if (exemptTables.has(table)) {
      continue;
    }
    const find = (name: string) =>
      columns.find(
        (column) => column.table === table && column.column === name,
      );
    const requireColumn = ({
      name,
      type,
      defaultValue,
    }: {
      name: string;
      type: string;
      defaultValue: string;
    }) => {
      const column = find(name);
      if (
        column?.type !== type ||
        column.isNullable !== "NO" ||
        column.default !== defaultValue
      ) {
        problems.push(
          `"${table}"."${name}" must be: ${type} not null default ${defaultValue}`,
        );
      }
    };

    requireColumn({
      name: "id",
      type: "uuid",
      defaultValue: "gen_random_uuid()",
    });
    requireColumn({
      name: createdAt,
      type: "timestamp with time zone",
      defaultValue: "now()",
    });
    if (appendOnlyTables.has(table)) {
      if (find(updatedAt)) {
        problems.push(
          `"${table}" is in APPEND_ONLY_TABLES, so it must not have "${updatedAt}"`,
        );
      }
      continue;
    }
    requireColumn({
      name: updatedAt,
      type: "timestamp with time zone",
      defaultValue: "now()",
    });
    const trigger = triggers.find((candidate) => candidate.table === table);
    if (!trigger) {
      problems.push(
        `"${table}" needs a trigger that runs "${SET_UPDATED_AT_FUNCTION}"() before each update`,
      );
    } else if (!/is distinct from/i.test(trigger.condition)) {
      problems.push(
        `The "${SET_UPDATED_AT_FUNCTION}" trigger of "${table}" needs: when (old.* is distinct from new.*)`,
      );
    }
  }
  return problems;
}
