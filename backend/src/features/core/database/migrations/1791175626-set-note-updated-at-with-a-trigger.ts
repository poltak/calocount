import { sql } from "kysely";
import { defineMigration } from "../migration.js";

export const migration = defineMigration({
  file: import.meta.url,
  async up(db) {
    // The note table is older than the "setUpdatedAt" function, so its trigger
    // is here and not in the migration that creates the table. The condition
    // keeps "updatedAt" as it is when an update changes nothing.
    await sql`
      create trigger "note_setUpdatedAt_trigger"
        before update on "note"
        for each row
        when (old.* is distinct from new.*)
        execute function "setUpdatedAt"()
    `.execute(db);
  },
});
