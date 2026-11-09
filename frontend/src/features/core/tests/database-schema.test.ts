import { describe, expect, it } from "vitest";
import { createFullApplication } from "./full-application.js";

// The table types cannot see the SQL of a migration. This test reads the
// database that the migrations made.
describe("database schema", () => {
  it("should give every application table the standard columns", async () => {
    const { backend } = await createFullApplication({ authenticated: false });

    // Each entry names a table and what it must have. See `BaseTable`.
    expect(
      await backend.schemaTools.findStandardColumnProblems(backend.db),
    ).toEqual([]);
  });

  it("should migrate a database that already has each table", async () => {
    const { backend } = await createFullApplication({ authenticated: false });

    // The test database comes migrated, as a development database is after
    // its first start. A second migration finds each table and column of the
    // auth SDK, and runs no application migration.
    expect(await backend.logic.migration.migrate()).toEqual([]);
  });

  it("should stop when a migration changed after the database ran it", async () => {
    const { backend } = await createFullApplication({ authenticated: false });
    // As a development database that ran an earlier version of the file.
    // Each project has this migration, also after it removes the example.
    await backend.schemaTools.recordMigrationHash(backend.db, {
      name: "1791175625-create-set-updated-at-function",
      hash: "the hash of an earlier version",
    });

    await expect(backend.logic.migration.migrate()).rejects.toThrow(
      /changed after this database ran them:\n {2}1791175625-create-set-updated-at-function\n[\s\S]*run `pnpm run db:reset`/,
    );
  });

  it("should stop when the file of a migration that the database ran is gone", async () => {
    const { backend } = await createFullApplication({ authenticated: false });
    await backend.schemaTools.recordMigrationHash(backend.db, {
      name: "1700000000-create-removed-table",
      hash: "any hash",
    });

    await expect(backend.logic.migration.migrate()).rejects.toThrow(
      /their files are gone:\n {2}1700000000-create-removed-table\n/,
    );
  });
});
