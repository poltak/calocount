import { findStandardColumnProblems } from "backend/testing";
import { describe, expect, it } from "vitest";
import { createFullApplication } from "./full-application.js";

// The table types cannot see the SQL of a migration. This test reads the
// database that the migrations made.
describe("database schema", () => {
  it("should give every application table the standard columns", async () => {
    const { backend } = await createFullApplication({ authenticated: false });

    // Each entry names a table and what it must have. See `BaseTable`.
    expect(await findStandardColumnProblems(backend.db)).toEqual([]);
  });

  it("should migrate a database that already has each table", async () => {
    const { backend } = await createFullApplication({ authenticated: false });

    // The test database comes migrated, as a development database is after
    // its first start. A second migration finds each table and column of the
    // auth SDK, and runs no application migration.
    expect(await backend.logic.migration.migrate()).toEqual([]);
  });
});
