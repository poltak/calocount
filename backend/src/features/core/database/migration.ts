import type { Kysely } from "kysely";

export interface DatabaseMigration {
  /**
   * The migration file's name without its extension, such as
   * `1791003845-create-note`. Migrations run in the order of their names.
   */
  name: string;
  /** Change the schema. Run each SQL statement in its own call. */
  up(db: Kysely<unknown>): Promise<void>;
}

/**
 * Define the migration that one file in `migrations/` holds. `migrations.ts`
 * gives it its name. See docs/agents/decisions.md for why the name does not
 * come from `import.meta.url`.
 *
 * @public Migration files use it; the unused-code check must keep it.
 */
export function defineMigration({
  up,
}: {
  /** Older migrations still pass this, and it has no effect. Do not change them. */
  file?: string;
  up: DatabaseMigration["up"];
}): Pick<DatabaseMigration, "up"> {
  return { up };
}
