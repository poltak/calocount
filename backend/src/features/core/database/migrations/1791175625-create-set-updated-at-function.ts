import { sql } from "kysely";
import { defineMigration } from "../migration.js";

export const migration = defineMigration({
  file: import.meta.url,
  async up(db) {
    // One function for every table. Each table with "updated_at" gets its own
    // trigger that runs it, in the migration that creates the table.
    await sql`
      create function "set_updated_at"() returns trigger
      language plpgsql as $$
      begin
        new."updated_at" = now();
        return new;
      end;
      $$
    `.execute(db);
  },
});
