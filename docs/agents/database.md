# Database

Read this before you change a table, a migration, or a transaction. The rest
of the architecture does not depend on the database. These rules do, so they
have a file of their own, and a project on another database can replace this
one file.

## Transactions

When an operation needs several writes to succeed or fail together, the backend
Logic method runs them in `this.deps.transaction()`. A Logic class gets
`transaction` when its props type includes `BackendTransactionProps`.

```ts
return this.deps.transaction(async (storage) => {
  const note = await storage.notes.create({ userId, title, body });
  await storage.activity.record({
    userId,
    action: "note.created",
    subjectId: note.id,
  });
  return note;
});
```

- The callback receives every Storage class, bound to the transaction. The
  transaction commits when the callback returns, and rolls back when it
  throws. Throw an `AppError` to roll back and report an expected failure.
- A transaction is the only place where a Logic class may use the Storage of
  another feature. Outside one, a Logic class uses only its own feature's
  Storage, from `this.deps.storage`.
- Inside the callback, use only the Storage that the callback receives.
  `this.deps.storage` is not part of the transaction, and lint rejects it
  there.
- Do not call a Service inside the callback, except a Core Service. An
  external effect cannot roll back, and the transaction stays open while the
  Service runs. Call the Service before or after the transaction.
- Keep the callback short. It holds reads, decisions, and writes, and nothing
  that waits for another system.
- A Storage method does not start a transaction. Atomic writes always start in
  Logic, so one operation has one transaction.

## Database schema

A change to the schema is a migration: one file in
`backend/src/features/core/database/migrations/`. Create it with
`pnpm run db:migration:create <name>`. The script names the file with the
current time, and rewrites the list in `migrations.ts`. Do not edit that list
by hand.

- Write plain SQL in the migration's `up` function, with one statement for
  each `sql` call. The test database rejects a call that holds several.
- The database has snake_case names, and TypeScript has camelCase names.
  `DatabaseNames` in `core/database/database-names.ts` changes each name in a
  query and in its result, also for the tables of the auth SDK. Raw SQL gets
  no change. So a migration writes `user_id`, and the table type and each
  query write `userId`.
- Put `"user"` in quotes in SQL, because `user` is a reserved word in
  PostgreSQL. Quotes around each other name are optional.
- A migration that creates an extension, such as `CREATE EXTENSION pg_trgm`,
  also adds it to `PGLITE_EXTENSIONS` in
  `core/database/pglite-extensions.ts`. The test databases are PGlite, which
  loads only the extensions in that list. The project owns that file, so a
  template sync does not change it.
- Before the merge, put each change to a table that the branch creates into
  the migration that creates the table, and run `pnpm run db:reset`. A pull
  request then has one migration for each new table or group of tables, and
  no migration that changes them again. `pnpm run check` fails on a migration
  that changes a table that another migration of the branch creates.
- After the merge, do not change, rename, or delete a migration. A database
  that already ran it does not get the change. Write a new migration. The
  exception is a project with no deployed database. Its `hasDeployedDatabase`
  in `core/database/deployment.json` is `false`, and the check then allows a
  change to a merged migration. Each developer then runs `pnpm run db:reset`.
  Set the value to `true` before the first deploy of a database with data.
  `pnpm run check` then fails on such a change.
- A database keeps a hash of the SQL of each migration that it ran. The
  migration of a database stops, and applies nothing, when the file of one of
  those migrations changed or is gone.
- Declare the table's row type in the owning feature's `storage/types.ts` and
  add it to `DatabaseSchema`, in the same change as the migration.
- Migrations only go forward. To undo a change, write a new migration.

Every application table has the same three columns, and the database makes
their values. Code never sets them.

```sql
create table "note" (
  "id" uuid primary key default gen_random_uuid(),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
)
```

```sql
create trigger "note_set_updated_at_trigger"
  before update on "note"
  for each row
  when (old.* is distinct from new.*)
  execute function "set_updated_at"()
```

- Write both statements in the migration that creates the table, with the
  table's other columns. The trigger sets `updated_at` when an update changes
  the record. Its condition leaves the value as it is when nothing changed.
- Make the table's type extend `BaseTable` from
  `core/database/standard-columns.ts`. `Database` does not compile when an
  application table's type lacks the three columns, and
  `database-schema.test.ts` checks the columns and the trigger in the real
  database.
- A table whose records never change, such as a log, has no `updated_at` and
  no trigger. Make its type extend `AppendOnlyTable`, and add its name to
  `APPEND_ONLY_TABLES` in the same file. This is the only exception.
- A migration that changes many records, such as one that fills a new column,
  also changes their `updated_at`. When that is wrong, turn the trigger off in
  that migration with `alter table … disable trigger`, and turn it on again
  after the change.
