import { sql } from "kysely";
import { defineMigration } from "../migration.js";

export const migration = defineMigration({
  file: import.meta.url,
  async up(db) {
    await sql`
      create table "activity" (
        "id" uuid primary key default gen_random_uuid(),
        "user_id" text not null references "user" ("id") on delete cascade,
        "action" text not null,
        "subject_id" text not null,
        "created_at" timestamptz not null default now()
      )
    `.execute(db);
  },
});
