import { sql } from "kysely";
import { defineMigration } from "../migration.js";

export const migration = defineMigration({
  file: import.meta.url,
  async up(db) {
    // The note table is older than the "set_updated_at" function, so its trigger
    // is here and not in the migration that creates the table. The condition
    // keeps "updated_at" as it is when an update changes nothing.
    await sql`
      create trigger "note_set_updated_at_trigger"
        before update on "note"
        for each row
        when (old.* is distinct from new.*)
        execute function "set_updated_at"()
    `.execute(db);
  },
});
