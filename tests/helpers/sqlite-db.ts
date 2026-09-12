import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle, type AnyD1Database } from "drizzle-orm/d1";
import * as schema from "../../db/schema";

/** Execute repository SQL against the real migrations, without remote bindings. */
export function createSqliteTestDb() {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../../drizzle/", import.meta.url);
  for (const file of readdirSync(migrations).filter((file) => file.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  }
  const queries: { sql: string; values: SQLInputValue[] }[] = [];
  function prepare(sql: string, values: SQLInputValue[] = []) {
    function rows(raw = false) {
      queries.push({ sql, values });
      const statement = sqlite.prepare(sql);
      statement.setReturnArrays(raw);
      return statement.all(...values);
    }
    return {
      bind: (...bound: SQLInputValue[]) => prepare(sql, bound),
      raw: async () => rows(true),
      all: async () => ({ success: true, results: rows(), meta: {} }),
      run: async () => {
        queries.push({ sql, values });
        return { success: true, results: [], meta: sqlite.prepare(sql).run(...values) };
      },
    };
  }
  const client = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = await Promise.all(statements.map((statement) => statement.all()));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, queries, db: drizzle(client as unknown as AnyD1Database, { schema }) };
}
