import { Migrator } from "kysely/migration";
import { migrations } from "../database/migrations.js";
import type { BackendStorageProps } from "./types.js";

/**
 * Applies the application's schema migrations and records which ones ran, in
 * tables that Kysely's migrator owns.
 */
export class MigrationStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  /**
   * Apply every migration that this database does not have yet, in the order
   * of their names. Returns the names of the migrations that ran.
   */
  async migrateToLatest(): Promise<string[]> {
    const migrator = new Migrator({
      db: this.deps.db,
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
    return results.map((result) => result.migrationName);
  }
}
