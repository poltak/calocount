import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect } from "kysely";

import { DatabaseNames } from "./database-names.js";
import type { Database, DatabaseSchema } from "./database.js";

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
      pglite: () => new PGlite(snapshot ? { loadDataDir: snapshot } : {}),
    }),
    plugins: [new DatabaseNames()],
  });
}

export async function createDatabaseSnapshot({
  from,
  prepare,
}: {
  /** The snapshot to start from. Without it, the database starts empty. */
  from?: DatabaseSnapshot;
  prepare: (db: Database) => Promise<void>;
}): Promise<DatabaseSnapshot> {
  const pglite = new PGlite(from ? { loadDataDir: from } : {});
  const db = new Kysely<DatabaseSchema>({
    dialect: new PGliteDialect({ pglite: () => pglite }),
    plugins: [new DatabaseNames()],
  });
  try {
    await prepare(db);
    // Without a checkpoint, each database that starts from the snapshot
    // replays the write-ahead log of the migrations first. That replay was
    // about a fifth of the start time of each test.
    await pglite.exec("CHECKPOINT");
    return await pglite.dumpDataDir("none");
  } finally {
    await db.destroy();
  }
}
