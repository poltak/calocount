import type { Kysely } from "kysely";

/** One step in the history of the database schema. */
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
 * Define the migration that one file in `migrations/` holds. Pass
 * `import.meta.url` as `file`, so that the migration's name is always the
 * file's name.
 *
 * @public Migration files use it; the unused-code check must keep it.
 */
export function defineMigration({
  file,
  up,
}: {
  file: string;
  up: DatabaseMigration["up"];
}): DatabaseMigration {
  const fileName = new URL(file).pathname.split("/").at(-1) ?? "";
  return { name: fileName.replace(/\.[cm]?[jt]s$/, ""), up };
}
