import { sql } from "kysely";
import { defineMigration } from "../migration.js";

export const migration = defineMigration({
  file: import.meta.url,
  async up(db) {
    await sql`
      create table "note" (
        "id" uuid primary key default gen_random_uuid(),
        "userId" text not null references "user" ("id") on delete cascade,
        "title" text not null,
        "body" text not null,
        "createdAt" timestamptz not null default now(),
        "updatedAt" timestamptz not null default now()
      )
    `.execute(db);
    // The list of one user's notes, newest change first.
    await sql`
      create index "note_userId_updatedAt_index"
        on "note" ("userId", "updatedAt" desc)
    `.execute(db);
  },
});
