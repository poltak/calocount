import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect } from "kysely";

import type { Database, DatabaseSchema } from "./database.js";

/** A copy of one database's files, used to start other databases. */
export type DatabaseSnapshot = Awaited<ReturnType<PGlite["dumpDataDir"]>>;

/**
 * Create an in-memory PostgreSQL database for one test app. It starts empty,
 * or with the contents of a snapshot, which is several times faster.
 */
export function createDatabase({
  snapshot,
}: { snapshot?: DatabaseSnapshot } = {}): Database {
  return new Kysely<DatabaseSchema>({
    dialect: new PGliteDialect({
      pglite: () => new PGlite({ loadDataDir: snapshot }),
    }),
  });
}

/** Build a database with `prepare` and return a snapshot of the result. */
export async function createDatabaseSnapshot(
  prepare: (db: Database) => Promise<void>,
): Promise<DatabaseSnapshot> {
  const pglite = new PGlite();
  const db = new Kysely<DatabaseSchema>({
    dialect: new PGliteDialect({ pglite: () => pglite }),
  });
  try {
    await prepare(db);
    return await pglite.dumpDataDir("none");
  } finally {
    await db.destroy();
  }
}
