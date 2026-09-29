import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect } from "kysely";

import type { Database, DatabaseSchema } from "./database.js";

/** Create a fresh in-memory PostgreSQL database for one test app. */
export function createDatabase(): Database {
  return new Kysely<DatabaseSchema>({
    dialect: new PGliteDialect({ pglite: () => new PGlite() }),
  });
}
