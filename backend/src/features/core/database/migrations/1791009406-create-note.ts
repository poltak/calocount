import { sql } from "kysely";
import { defineMigration } from "../migration.js";

export const migration = defineMigration({
  file: import.meta.url,
  async up(db) {
    await sql`
      create table "note" (
        "id" uuid primary key default gen_random_uuid(),
        "user_id" text not null references "user" ("id") on delete cascade,
        "title" text not null,
        "body" text not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      )
    `.execute(db);
    // The list of one user's notes, newest change first.
    await sql`
      create index "note_user_id_updated_at_index"
        on "note" ("user_id", "updated_at" desc)
    `.execute(db);
  },
});
