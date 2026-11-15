import { Logic } from "@app/common/features/core/logic/logic";
import type { DatabaseMigration } from "../database/migration.js";
import type { BackendLogicProps } from "./types.js";

type MigrationProps = BackendLogicProps<"migration", "auth">;

/**
 * Trusted operator workflow that brings the database schema up to date. It is
 * never registered as an HTTP endpoint.
 */
export class MigrationLogic extends Logic<
  MigrationProps,
  Record<string, never>
> {
  constructor(deps: MigrationProps) {
    super({ deps, initialState: {} });
  }

  /**
   * Apply the auth SDK's schema changes, then the application's migrations,
   * which can refer to the auth tables. Returns the names of the application
   * migrations that ran. The caller gives the list, so that a server does not
   * load a migration.
   */
  async migrate({
    migrations,
  }: {
    migrations: DatabaseMigration[];
  }): Promise<string[]> {
    await this.deps.services.auth.migrate();
    return this.deps.storage.migration.migrateToLatest({ migrations });
  }
}
