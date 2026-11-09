import assert from "node:assert/strict";
import test from "node:test";
import { parseCalendarMonth, parseDashboardPayload, parseDayLog, parseMealResponse, parseWeightResponse } from "../app/dashboard-api";
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

test("calendar month parsing keeps the days of the month and rejects days outside it", () => {
  const day = { date: "2026-08-20", calories: 800.3, proteinG: 40, mealCount: 2 };
  assert.deepEqual(parseCalendarMonth({ month: "2026-08", timezone: "UTC", firstDate: "2026-07-04", days: [day] }), {
    month: "2026-08", firstDate: "2026-07-04", days: [day],
  });
  assert.deepEqual(parseCalendarMonth({ month: "2026-08", firstDate: null, days: [] }), { month: "2026-08", firstDate: null, days: [] });
  assert.equal(parseCalendarMonth({ month: "2026-08", firstDate: null, days: [{ ...day, date: "2026-09-01" }] }), null);
  assert.equal(parseCalendarMonth({ month: "2026-08", firstDate: null, days: [{ ...day, calories: "800" }] }), null);
  assert.equal(parseCalendarMonth({ month: "2026-08", firstDate: "soon", days: [] }), null);
  assert.equal(parseCalendarMonth({ month: "August", firstDate: null, days: [] }), null);
  assert.equal(parseCalendarMonth({ month: "2026-08", firstDate: null }), null);
});

test("day log parsing reads the entries, weight and protein goal, and rejects a damaged entry", () => {
  const meal = {
    id: "meal", consumedAt: Date.parse("2026-08-20T12:00:00Z"), caption: "Dinner", mealType: "dinner", status: "complete",
    totalCalories: 700, totalProteinG: 45, totalCarbsG: 60, totalFatG: 20,
    items: [{ name: "Dinner", calories: 700, proteinG: 45, carbsG: 60, fatG: 20 }],
  };
  const weight = { logicalDate: "2026-08-20", weightKg: 72, recordedAt: 1 };
  const proteinGoal = { date: "2026-08-20", targetG: 144, weightKg: 72, weightDate: "2026-08-20" };
  const parsed = parseDayLog({ date: "2026-08-20", timezone: "UTC", meals: [meal], weight, proteinGoal });
  assert.equal(parsed?.date, "2026-08-20");
  assert.deepEqual(parsed?.meals.map((entry) => [entry.id, entry.totalCalories, entry.items[0].name]), [["meal", 700, "Dinner"]]);
  assert.deepEqual(parsed?.weight, weight);
  assert.deepEqual(parsed?.proteinGoal, proteinGoal);

  assert.deepEqual(parseDayLog({ date: "2026-08-20", meals: [], weight: null }), { date: "2026-08-20", meals: [], weight: null, proteinGoal: null });
  assert.equal(parseDayLog({ date: "2026-08-20", meals: [{ ...meal, items: [{}] }], weight: null }), null);
  assert.equal(parseDayLog({ date: "2026-08-20", meals: [], weight: { ...weight, weightKg: 0 } }), null);
  assert.equal(parseDayLog({ date: "2026-02-31", meals: [], weight: null }), null);
  assert.equal(parseDayLog({ date: "2026-08-20", weight: null }), null);
});
