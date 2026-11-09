// `pnpm run db:migration:create` writes this file. Do not edit it by hand.
import type { DatabaseMigration } from "./migration.js";
import { migration as createNote1791009406 } from "./migrations/1791009406-create-note.js";
import { migration as createActivity1791009729 } from "./migrations/1791009729-create-activity.js";
import { migration as createSetUpdatedAtFunction1791175625 } from "./migrations/1791175625-create-set-updated-at-function.js";
import { migration as setNoteUpdatedAtWithATrigger1791175626 } from "./migrations/1791175626-set-note-updated-at-with-a-trigger.js";

/** Every migration in `migrations/`. They run in the order of their names. */
export const migrations: DatabaseMigration[] = [
  { name: "1791009406-create-note", ...createNote1791009406 },
  { name: "1791009729-create-activity", ...createActivity1791009729 },
  {
    name: "1791175625-create-set-updated-at-function",
    ...createSetUpdatedAtFunction1791175625,
  },
  {
    name: "1791175626-set-note-updated-at-with-a-trigger",
    ...setNoteUpdatedAtWithATrigger1791175626,
  },
];
