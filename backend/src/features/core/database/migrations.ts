// `pnpm run db:migration:create` writes this file. Do not edit it by hand.
import type { DatabaseMigration } from "./migration.js";

/** Every migration in `migrations/`. They run in the order of their names. */
export const migrations: DatabaseMigration[] = [];
