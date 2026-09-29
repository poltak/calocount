import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database, DatabaseSchema } from "./database.js";

interface PostgresDatabaseParams {
  connectionString: string;
}

/** Create a PostgreSQL query builder without opening a connection yet. */
export function createDatabase({
  connectionString,
}: PostgresDatabaseParams): Database {
  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  });
}
