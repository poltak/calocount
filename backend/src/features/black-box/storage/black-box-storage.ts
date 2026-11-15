import { sql } from "kysely";
import {
  planRaw,
  type PlannedStatement,
} from "../../core/database/planned-statement.js";
import type { BackendStorageProps } from "../../core/storage/types.js";

/** Quote a table name as an SQL identifier. */
function quoteName(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** The deletes of the reset route for the black-box tests. */
export class BlackBoxStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  /** Each table of the app. The migration record and the system tables stay out. */
  async listTableNames(): Promise<string[]> {
    const { rows } = await sql<{ name: string }>`
      select name from sqlite_master where type = 'table' order by name
    `.execute(this.deps.db);
    return rows
      .map(({ name }) => name)
      .filter(
        (name) =>
          !name.startsWith("sqlite_") &&
          !name.startsWith("_cf_") &&
          name !== "d1_migrations",
      );
  }

  /** Let the foreign keys wait for the end of the batch, so the deletes can run in any order. */
  planDeferForeignKeys(): PlannedStatement<never> {
    return planRaw({ sql: "pragma defer_foreign_keys = on" });
  }

  planDeleteAllRows({
    tableName,
  }: {
    tableName: string;
  }): PlannedStatement<never> {
    return planRaw({ sql: `delete from ${quoteName(tableName)}` });
  }
}
