import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect } from "kysely";

import { DatabaseNames } from "./database-names.js";
import { PGLITE_EXTENSIONS } from "./pglite-extensions.js";
import type { Database, DatabaseSchema } from "./database.js";

/**
 * A test database as plain data, because the test runner hands it to each test
 * file. PGlite makes a tar file of its data directory.
 */
export type DatabaseSnapshot = ArrayBuffer;

function pgliteOptions(snapshot?: DatabaseSnapshot) {
  return {
    extensions: PGLITE_EXTENSIONS,
    ...(snapshot
      ? { loadDataDir: new Blob([snapshot], { type: "application/x-tar" }) }
      : {}),
  };
}

/**
 * Create an in-memory PostgreSQL database for one test app. It starts empty,
 * or with the contents of a snapshot, which is several times faster. The
 * fixture awaits this, because an engine on a server must copy a database
 * first.
 */
export async function createDatabase({
  snapshot,
}: { snapshot?: DatabaseSnapshot } = {}): Promise<Database> {
  return new Kysely<DatabaseSchema>({
    dialect: new PGliteDialect({
      pglite: () => new PGlite(pgliteOptions(snapshot)),
    }),
    plugins: [new DatabaseNames()],
  });
}

export async function createDatabaseSnapshot({
  from,
  prepare,
}: {
  from?: DatabaseSnapshot;
  prepare: (db: Database) => Promise<void>;
}): Promise<DatabaseSnapshot> {
  const pglite = new PGlite(pgliteOptions(from));
  const db = new Kysely<DatabaseSchema>({
    dialect: new PGliteDialect({ pglite: () => pglite }),
    plugins: [new DatabaseNames()],
  });
  try {
    await prepare(db);
    if (!from) {
      // No test creates a database, so a test needs no template database.
      // Without them, each database that starts from the snapshot starts
      // about a quarter faster. Postgres runs `DROP DATABASE` only as a
      // statement of its own.
      await pglite.exec(
        "UPDATE pg_database SET datistemplate = false WHERE datname IN ('template0', 'template1')",
      );
      await pglite.exec("DROP DATABASE template0");
      await pglite.exec("DROP DATABASE template1");
    }
    // Without a checkpoint, each database that starts from the snapshot
    // replays the write-ahead log of the migrations first. That replay was
    // about a fifth of the start time of each test.
    await pglite.exec("CHECKPOINT");
    const dump = await pglite.dumpDataDir("none");
    return await dump.arrayBuffer();
  } finally {
    await db.destroy();
  }
}
