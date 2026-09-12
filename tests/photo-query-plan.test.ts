import assert from "node:assert/strict";
import test from "node:test";
import { createSqliteTestDb } from "./helpers/sqlite-db";

test("photo cleanup and owned lookups search an index instead of scanning meal history", () => {
  const fixture = createSqliteTestDb();
  try {
    for (const [sql, bindings] of [
      ["SELECT photo_key FROM meal_logs WHERE photo_key IN (?, ?)", ["photo-1", "photo-2"]],
      ["SELECT id FROM meal_logs WHERE owner_key = ? AND photo_key = ? LIMIT 1", ["owner", "photo-1"]],
    ] as const) {
      const plan = fixture.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...bindings);
      const detail = plan.map((row) => row.detail).join("\n");
      assert.match(detail, /SEARCH meal_logs/);
      assert.match(detail, /photo_key=\?/);
      assert.doesNotMatch(detail, /SCAN meal_logs/);
    }
    assert.equal(fixture.sqlite.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  } finally {
    fixture.sqlite.close();
  }
});
