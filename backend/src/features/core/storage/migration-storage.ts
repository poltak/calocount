import { sql } from "kysely";
import { DEFAULT_MIGRATION_TABLE, Migrator } from "kysely/migration";
import {
  MIGRATION_HASH_TABLE,
  hashMigrations,
} from "../database/migration-hashes.js";
import type { DatabaseMigration } from "../database/migration.js";
import type { BackendStorageProps } from "./types.js";

/**
 * Applies the application's schema migrations and records which ones ran, in
 * tables that Kysely's migrator owns, and the hash of each one.
 */
export class MigrationStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  /**
   * Apply every migration that this database does not have yet, in the order
   * of their names. Returns the names of the migrations that ran. Applies none
   * when a migration that the database ran changed, or when its file is gone.
   */
  async migrateToLatest({
    migrations,
  }: {
    migrations: DatabaseMigration[];
  }): Promise<string[]> {
    const { db } = this.deps;
    const hashes = await hashMigrations(migrations);
    await sql`
      create table if not exists ${sql.table(MIGRATION_HASH_TABLE)} (
        "name" text primary key,
        "hash" text not null
      )
    `.execute(db);

    const { rows: recorded } = await sql<{ name: string; hash: string }>`
      select "name", "hash" from ${sql.table(MIGRATION_HASH_TABLE)}
    `.execute(db);
    const changed = recorded
      .filter(({ name, hash }) => hashes.has(name) && hashes.get(name) !== hash)
      .map(({ name }) => name);
    const gone = (await this.ranMigrations()).filter(
      (name) => !hashes.has(name),
    );
    if (changed.length > 0 || gone.length > 0) {
      throw new Error(
        [
          ...(changed.length > 0
            ? [
                "These migrations changed after this database ran them:",
                ...changed.map((name) => `  ${name}`),
              ]
            : []),
          ...(gone.length > 0
            ? [
                "This database ran these migrations, and their files are gone:",
                ...gone.map((name) => `  ${name}`),
              ]
            : []),
          "A database does not run a migration again, so it does not get such a change.",
          "- For a development database, run `pnpm run db:reset`, which deletes its data.",
          "- For a deployed database, restore each file as it was, and write a new migration for the change. Then set `hasDeployedDatabase` to true in `backend/src/features/core/database/deployment.json`, so that `pnpm run check` stops such a change.",
        ].join("\n"),
      );
    }

    const migrator = new Migrator({
      db,
      provider: {
        getMigrations: async () =>
          Object.fromEntries(migrations.map(({ name, up }) => [name, { up }])),
      },
      // Branches merge in any order, so a migration with an older timestamp can
      // arrive after a newer one ran. Without this, that database would refuse
      // every later migration.
      allowUnorderedMigrations: true,
    });
    const { error, results = [] } = await migrator.migrateToLatest();
    if (error) {
      throw error;
    }

    // A database from before the hashes gets them at its next migration. A
    // change to a migration before then stays unseen.
    const ran = await this.ranMigrations();
    if (ran.length > 0) {
      await sql`
        insert into ${sql.table(MIGRATION_HASH_TABLE)} ("name", "hash")
        values ${sql.join(ran.map((name) => sql`(${name}, ${hashes.get(name)})`))}
        on conflict ("name") do nothing
      `.execute(db);
    }
    return results.map((result) => result.migrationName);
  }

  /** The names in Kysely's table, which a new database does not have yet. */
  private async ranMigrations(): Promise<string[]> {
    const { db } = this.deps;
    const {
      rows: [table],
    } = await sql<{ exists: boolean }>`
      select to_regclass(${DEFAULT_MIGRATION_TABLE}) is not null as "exists"
    `.execute(db);
    if (!table?.exists) {
      return [];
    }
    const { rows } = await sql<{ name: string }>`
      select "name" from ${sql.table(DEFAULT_MIGRATION_TABLE)}
    `.execute(db);
    return rows.map((row) => row.name);
  }
}
