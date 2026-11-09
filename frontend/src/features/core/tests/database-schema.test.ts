import { describe, expect, it } from "vitest";
import { createFullApplication } from "./full-application.js";

// The table types cannot see the SQL of a migration. This test reads the
// database that the migrations made.
describe("database schema", () => {
  it("should give every new table the standard columns", async () => {
    const { backend } = await createFullApplication({ authenticated: false });

    // Each entry names a table and what it must have. See `BaseTable`. The
    // tables of the old app keep their own columns, as `ADOPTED_TABLES` says.
    expect(
      await backend.schemaTools.findStandardColumnProblems(backend.db),
    ).toEqual([]);
  });
});
