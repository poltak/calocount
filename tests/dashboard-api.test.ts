import assert from "node:assert/strict";
import test from "node:test";
import { parseDashboardPayload, parseMealResponse, parseWeightResponse } from "../app/dashboard-api";
import { projectPublicDashboardSummary } from "../app/api/_lib/public-summary-projection";
import { serialiseMeals, withoutOwnerKey } from "../app/api/_lib/serialise";
import { getDashboardSummary } from "../db/repository";
import { createSqliteTestDb } from "./helpers/sqlite-db";

test("dashboard parsing accepts the real private and public summary contracts", async () => {
  const fixture = createSqliteTestDb();
  try {
    const now = new Date("2026-09-12T12:00:00Z");
    fixture.sqlite.prepare("INSERT INTO meal_logs (id, owner_key, consumed_at, status, total_calories) VALUES (?, ?, ?, ?, ?)")
      .run("meal", "owner", now.getTime(), "complete", 100);
    fixture.sqlite.exec("INSERT INTO meal_items (id, meal_id, owner_key, name, calories) VALUES ('item', 'meal', 'owner', 'Apple', 100)");
    const summary = await getDashboardSummary(fixture.db, "owner", { now });
    const privateBody = { ...summary, recentMeals: serialiseMeals(summary.recentMeals), recentWeights: summary.recentWeights.map(withoutOwnerKey) };
    const publicBody = projectPublicDashboardSummary(summary);
    for (const body of [privateBody, publicBody]) {
      const parsed = parseDashboardPayload(body);
      assert.ok(parsed);
      assert.equal(parsed.today.calories, 100);
      assert.equal(parsed.recentMeals[0].items[0].name, "Apple");
      assert.equal(parsed.recentMeals[0].items[0].nutrients?.fiberG, null);
      assert.equal(parsed.trend?.byDate.length, 30);
    }

    const invalidInputs: unknown[] = [
      { date: summary.date, today: {}, sevenDay: {} },
      { ...privateBody, date: "2026-02-31" },
      { ...privateBody, today: { ...summary.today, calories: "100" } },
      { ...privateBody, targets: { ...summary.targets, calories: Number.NaN } },
      { ...privateBody, recentMeals: [{ ...privateBody.recentMeals[0], items: [{ name: "Broken item" }] }] },
      { ...privateBody, recentWeights: [{ logicalDate: "invalid", weightKg: 70, recordedAt: now.getTime() }] },
      { ...privateBody, trend: { byDate: [{ date: summary.date }], weights: [] } },
      { ...privateBody, trend: { ...summary.trend, weights: [{ logicalDate: summary.date, weightKg: -1, recordedAt: now.getTime() }] } },
    ];
    for (const input of invalidInputs) assert.equal(parseDashboardPayload(input), null);
  } finally {
    fixture.sqlite.close();
  }
});

test("write response parsing rejects invalid dates and missing nutrition values", () => {
  assert.equal(parseWeightResponse({ weight: { logicalDate: "2026-02-31", weightKg: 70, recordedAt: 1 } }), null);
  assert.equal(parseWeightResponse({ weight: { logicalDate: "2026-09-12", weightKg: 0, recordedAt: 1 } }), null);
  assert.equal(parseMealResponse({ meal: { id: "meal", consumedAt: 1, totalCalories: 0, totalProteinG: 0, totalCarbsG: 0, totalFatG: 0, items: [{}] } }), null);
});
