import assert from "node:assert/strict";
import test from "node:test";
import { getExportData } from "../db/repository";
import { buildExportResponse } from "../app/api/_lib/export";
import { createSqliteTestDb } from "./helpers/sqlite-db";

test("exports include more than 10000 meals, 500 AI runs, and one year of weights in five queries", async () => {
  const fixture = createSqliteTestDb();
  try {
    fixture.sqlite.exec(`
      WITH RECURSIVE seq(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM seq WHERE i<10001)
      INSERT INTO meal_logs (id, owner_key, consumed_at) SELECT 'meal-'||i, 'owner', i FROM seq;
      INSERT INTO meal_items (id, meal_id, owner_key, name, fiber_g)
      SELECT 'item-'||id, id, 'owner', 'Meal', 2 FROM meal_logs;
      INSERT INTO ai_runs (id, owner_key, adapter) SELECT id, 'owner', 'historical' FROM meal_logs LIMIT 501;
      INSERT INTO daily_weights (id, owner_key, logical_date, weight_kg, recorded_at)
      SELECT id, 'owner', date('2020-01-01', consumed_at||' days'), 70, consumed_at FROM meal_logs LIMIT 400;
      INSERT INTO meal_logs (id, owner_key, consumed_at) VALUES ('foreign', 'other-owner', 0);
      INSERT INTO meal_items (id, meal_id, owner_key, name) VALUES ('foreign-item', 'meal-1', 'other-owner', 'Hidden');
    `);
    const response = await buildExportResponse({ format: "json", loadData: () => getExportData({ db: fixture.db, ownerKey: "owner" }) });
    const exported = await response.json() as {
      meals: { items: unknown[] }[]; weights: unknown[]; aiRuns: unknown[];
    };
    assert.equal(exported.meals.length, 10001);
    assert.equal(exported.meals.reduce((count: number, meal: { items: unknown[] }) => count + meal.items.length, 0), 10001);
    assert.equal(exported.weights.length, 400);
    assert.equal(exported.aiRuns.length, 501);
    assert.equal(fixture.queries.length, 5);
    assert.ok(!JSON.stringify(exported).includes("ownerKey"));
    assert.ok(!JSON.stringify(exported).includes("foreign"));
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    fixture.sqlite.close();
  }
});

test("invalid export formats do not query data", async () => {
  const response = await buildExportResponse({ format: "pdf", loadData: async () => { throw new Error("must not load"); } });
  assert.equal(response.status, 400);
});

test("CSV keeps exact values, unknown nutrients, quoting, and spreadsheet formula protection", async () => {
  const fixture = createSqliteTestDb();
  try {
    fixture.sqlite.prepare("INSERT INTO meal_logs (id, owner_key, consumed_at, caption) VALUES (?, ?, ?, ?)").run("meal", "owner", 0, "=1+1");
    fixture.sqlite.prepare("INSERT INTO meal_items (id, meal_id, owner_key, name, fiber_g) VALUES (?, ?, ?, ?, ?)").run("item", "meal", "owner", 'Rice, "white"', 2.5);
    const response = await buildExportResponse({ format: "csv", loadData: () => getExportData({ db: fixture.db, ownerKey: "owner" }) });
    const text = await response.text();
    assert.ok(text.includes('"fiberG"'));
    assert.ok(text.includes('"2.5"'));
    assert.ok(text.includes('"Rice, ""white"""'));
    assert.ok(text.includes("\"'=1+1\""));
    assert.ok(text.includes('"2.5",""'));
  } finally {
    fixture.sqlite.close();
  }
});
