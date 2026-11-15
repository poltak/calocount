import { sql, type Kysely } from "kysely";
import { DatabaseNames } from "./database-names.js";
import { ADOPTED_TABLES } from "./table-kinds.js";

interface ColumnRow {
  table: string;
  column: string;
  type: string;
  notNull: number;
}

/**
 * Compare the tables in the database with `BaseTable`, and describe each
 * difference. An empty list means that every table is correct. The types
 * cannot see the SQL of a migration, so this reads what the migrations made.
 * `pragma_table_info` runs on the Node host only, so its test runs there.
 */
export async function findStandardColumnProblems<Schema>(
  db: Kysely<Schema>,
): Promise<string[]> {
  const { rows } = await sql<ColumnRow>`
    select
      m.name as "table",
      p.name as "column",
      p.type as "type",
      p."notnull" as "notNull"
    from sqlite_schema m
    join pragma_table_info(m.name) p
    where m.type = 'table'
      and m.name not like 'sqlite!_%' escape '!'
      and m.name not like '!_cf!_%' escape '!'
      and m.name <> 'd1_migrations'
    order by m.name, p.cid
  `.execute(db);

  const names = new DatabaseNames();
  const exempt = new Set(ADOPTED_TABLES.map((name) => names.inDatabase(name)));
  const problems: string[] = [];
  for (const table of new Set(rows.map((row) => row.table))) {
    if (exempt.has(table)) {
      continue;
    }
    const required = [
      { name: "id", type: "TEXT" },
      { name: "created_at", type: "INTEGER" },
      { name: "updated_at", type: "INTEGER" },
    ];
    for (const { name, type } of required) {
      const column = rows.find(
        (row) => row.table === table && row.column === name,
      );
      if (column?.type !== type || (name !== "id" && !column.notNull)) {
        problems.push(`"${table}"."${name}" must be: ${type} not null`);
      }
    }
  }
  return problems;
}
