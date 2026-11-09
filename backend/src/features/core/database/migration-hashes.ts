import { createHash } from "node:crypto";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  sql,
} from "kysely";
import { DEFAULT_MIGRATION_TABLE } from "kysely/migration";
import type { DatabaseMigration } from "./migration.js";

/**
 * The table in which a database keeps a hash of each migration that it ran.
 * Kysely's own table keeps only the names. Without the hashes, nothing finds a
 * changed migration, because the database does not run it again.
 */
export const MIGRATION_HASH_TABLE = "migration_hash";

/**
 * A hash of the SQL that each migration sends. Each migration runs against a
 * driver that sends nothing. So a hash changes when the statements change,
 * and not when a compiler or a formatter changes the code around them. A
 * change of the spaces and line breaks in a statement changes no hash either.
 */
export async function hashMigrations(
  migrations: DatabaseMigration[],
): Promise<Map<string, string>> {
  let statements: unknown[] = [];
  const recorder = new Kysely<unknown>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => {
      statements.push([
        event.query.sql.replace(/\s+/g, " ").trim(),
        event.query.parameters,
      ]);
    },
  });
  const hashes = new Map<string, string>();
  try {
    for (const migration of migrations) {
      statements = [];
      await migration.up(recorder);
      hashes.set(
        migration.name,
        createHash("sha256").update(JSON.stringify(statements)).digest("hex"),
      );
    }
  } finally {
    await recorder.destroy();
  }
  return hashes;
}

/**
 * For the test of the migration guard: record that the database ran a
 * migration, with the given hash. A hash that differs from the file's hash
 * is a database that ran another version of the file. A name with no file is
 * a migration whose file is gone.
 */
export async function recordMigrationHash<Schema>(
  db: Kysely<Schema>,
  { name, hash }: { name: string; hash: string },
): Promise<void> {
  await sql`
    insert into ${sql.table(DEFAULT_MIGRATION_TABLE)} ("name", "timestamp")
    values (${name}, ${new Date().toISOString()})
    on conflict do nothing
  `.execute(db);
  await sql`
    insert into ${sql.table(MIGRATION_HASH_TABLE)} ("name", "hash")
    values (${name}, ${hash})
    on conflict ("name") do update set "hash" = excluded."hash"
  `.execute(db);
}
