import { sql } from "kysely";
import { defineMigration } from "../migration.js";

export const migration = defineMigration({
  file: import.meta.url,
  async up(db) {
    // One function for every table. Each table with "updatedAt" gets its own
    // trigger that runs it.
    await sql`
      create function "setUpdatedAt"() returns trigger
      language plpgsql as $$
      begin
        new."updatedAt" = now();
        return new;
      end;
      $$
    `.execute(db);
    // The condition keeps "updatedAt" as it is when an update changes nothing.
    await sql`
      create trigger "note_setUpdatedAt_trigger"
        before update on "note"
        for each row
        when (old.* is distinct from new.*)
        execute function "setUpdatedAt"()
    `.execute(db);
  },
});
