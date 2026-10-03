// `pnpm run db:migration:create` writes this file. Do not edit it by hand.
import type { DatabaseMigration } from "./migration.js";
import { migration as createNote1791009406 } from "./migrations/1791009406-create-note.js";
import { migration as createActivity1791009729 } from "./migrations/1791009729-create-activity.js";

/** Every migration in `migrations/`. They run in the order of their names. */
export const migrations: DatabaseMigration[] = [
  createNote1791009406,
  createActivity1791009729,
];
