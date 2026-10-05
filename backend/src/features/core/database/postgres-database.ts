import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database, DatabaseSchema } from "./database.js";

interface PostgresDatabaseParams {
  connectionString: string;
  logger: LoggerServiceInterface;
}

/** Create a PostgreSQL query builder without opening a connection yet. */
export function createDatabase({
  connectionString,
  logger,
}: PostgresDatabaseParams): Database {
  const pool = new Pool({ connectionString });
  // A connection that waits in the pool fails when the database restarts or
  // the network drops. The pool removes it and opens a new one for the next
  // query. Without this listener, Node stops the process on that event.
  pool.on("error", (error) => {
    logger.warn("A database connection in the pool failed", { error });
  });
  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}
