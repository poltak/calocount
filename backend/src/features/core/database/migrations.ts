// `pnpm run db:migration:create` writes this file. Do not edit it by hand.
import type { DatabaseMigration } from "./migration.js";
import { migration as createSetUpdatedAtFunction1791175625 } from "./migrations/1791175625-create-set-updated-at-function.js";

/** Every migration in `migrations/`. They run in the order of their names. */
export const migrations: DatabaseMigration[] = [
  {
    name: "1791175625-create-set-updated-at-function",
    ...createSetUpdatedAtFunction1791175625,
  },
];
