import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardSummary } from "../db/repository";
import { projectPublicDashboardSummary } from "../app/api/_lib/public-summary-projection";
import { parseDashboardPayload } from "../app/dashboard-api";
import { createSqliteTestDb } from "./helpers/sqlite-db";

test("insights include 30 finished days of completed food and drink logs without exposing private data", async () => {
  const fixture = createSqliteTestDb();
  try {
    const now = new Date("2026-09-19T12:00:00Z");
    const insert = fixture.sqlite.prepare("INSERT INTO meal_logs (id, owner_key, consumed_at, status, total_calories, caption, notes, photo_key) VALUES (?, ?, ?, ?, ?, 'private caption', 'private note', 'private/photo')");
    for (const [id, owner, date, status] of [
      ["first", "owner", "2026-08-20T00:00:00Z", "complete"],
      ["old", "owner", "2026-08-19T23:59:59Z", "complete"],
      ["tea", "owner", "2026-09-18T16:30:00Z", "complete"],
      ["today", "owner", "2026-09-19T07:00:00Z", "complete"],
      ["pending", "owner", "2026-09-18T12:00:00Z", "pending"],
      ["foreign", "someone-else", "2026-09-18T12:00:00Z", "complete"],
    ]) insert.run(id, owner, Date.parse(date), status, 0);
    fixture.sqlite.exec("INSERT INTO meal_items (id, meal_id, owner_key, name, calories, protein_g, caffeine_mg, fiber_g, source) VALUES ('tea-item', 'tea', 'owner', 'Black tea', 0, 0, 40, NULL, 'private source')");
    fixture.sqlite.exec("INSERT INTO settings (id, owner_key, daily_calorie_target, protein_goal_mode, daily_protein_target_per_kg) VALUES ('settings', 'owner', 2100, 'gramsPerKg', 2)");
    fixture.sqlite.exec("INSERT INTO daily_weights (id, owner_key, logical_date, weight_kg, recorded_at) VALUES ('weight', 'owner', '2026-08-19', 70, 1)");

    const summary = await getDashboardSummary(fixture.db, "owner", { now });
    assert.equal(summary.trend.byDate.length, 30);
    assert.equal(summary.insights.fromDate, "2026-08-20");
    assert.equal(summary.insights.toDate, "2026-09-19");
    assert.deepEqual(summary.insights.entries.map((entry) => entry.id).sort(), ["first", "tea", "today"]);
    assert.equal(summary.proteinGoal.byDate.length, 31);
    assert.equal(summary.proteinGoal.byDate[0].targetG, 140);
    assert.equal(summary.insights.entries.find((entry) => entry.id === "tea")?.items[0].nutrients.fiberG, null);
    assert.equal(summary.insights.entries.find((entry) => entry.id === "tea")?.items[0].nutrients.caffeineMg, 40);

    // Projection must whitelist the new nested contract as well as existing fields.
    Object.assign(summary.insights.entries[0], { caption: "private caption", ownerKey: "secret" });
    const projection = projectPublicDashboardSummary(summary);
    const serialized = JSON.stringify(projection.insights);
    assert.doesNotMatch(serialized, /ownerKey|caption|notes|photoKey|private|confidence|source/);
    const parsed = parseDashboardPayload(projection);
    assert.ok(parsed?.insights);
    assert.equal(parsed.insights.entries.length, 3);
    assert.equal(parsed.insights.entries.find((entry) => entry.id === "tea")?.items[0].nutrients?.caffeineMg, 40);
    assert.equal(parseDashboardPayload({ ...projection, insights: { ...projection.insights, fromDate: "2026-01-01" } }), null);
    assert.equal(parseDashboardPayload({ ...projection, insights: { ...projection.insights, entries: [{ ...projection.insights!.entries[0], date: "2026-02-31" }] } }), null);
    assert.equal(parseDashboardPayload({ ...projection, insights: { ...projection.insights, entries: [{ ...projection.insights!.entries[0], items: [{ name: "Invalid" }] }] } }), null);
  } finally {
    fixture.sqlite.close();
  }
});

test("insight dates follow the owner's requested day boundary", async () => {
  const fixture = createSqliteTestDb();
  try {
    fixture.sqlite.prepare("INSERT INTO meal_logs (id, owner_key, consumed_at, status) VALUES ('tea', 'owner', ?, 'complete')")
      .run(Date.parse("2026-09-18T18:30:00Z"));
    const summary = await getDashboardSummary(fixture.db, "owner", { now: new Date("2026-09-19T12:00:00Z"), timezone: "Asia/Ho_Chi_Minh" });
    assert.equal(summary.insights.entries[0].date, "2026-09-19");
    assert.equal(summary.today.mealCount, 1);

    const publicUtcSummary = await getDashboardSummary(fixture.db, "owner", { now: new Date("2026-09-19T12:00:00Z") });
    assert.equal(publicUtcSummary.insights.entries[0].date, "2026-09-18");
    assert.equal(projectPublicDashboardSummary(publicUtcSummary).insights?.entries[0]?.date, "2026-09-18");
  } finally {
    fixture.sqlite.close();
  }
});
