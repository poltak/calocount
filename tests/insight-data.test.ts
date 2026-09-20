import assert from "node:assert/strict";
import test from "node:test";
import { buildInsightData } from "../app/insights/insight-data";
import type { InsightEntry, InsightHistory } from "../app/insights/types";

const entry = (id: string, date: string, calories = 100): InsightEntry => ({
  id, date, consumedAt: Date.parse(`${date}T12:00:00Z`), calories, proteinG: 3,
  items: [{ name: "Coffee with milk", calories, proteinG: 3, nutrients: { caffeineMg: 80, fiberG: null } }],
});

test("insight data replaces edited dates and removes deleted logs without losing older history", () => {
  const old = entry("old", "2026-09-01");
  const deleted = entry("deleted", "2026-09-18");
  const history: InsightHistory = { fromDate: "2026-08-20", toDate: "2026-09-19", entries: [old, deleted] };
  const result = buildInsightData(history, [{ date: "2026-09-18", meals: [] }, {
    date: "2026-09-19", meals: [{ id: "edited", consumedAt: 0, calories: 50, protein: 2, items: [{ name: "Coffee", calories: 50, proteinG: 2, nutrients: { caffeineMg: 60 } }] }],
  }], []);
  assert.equal(result.days.length, 31);
  assert.deepEqual(result.entries.map((entry) => entry.id).sort(), ["edited", "old"]);
  assert.equal(result.days.find((day) => day.date === "2026-09-18")?.mealCount, 0);
  assert.equal(result.days.find((day) => day.date === "2026-09-19")?.calories, 50);
  assert.equal(result.days.find((day) => day.date === "2026-09-19")?.nutrients.caffeineMg?.amount, 60);
  assert.equal(result.days.find((day) => day.date === "2026-09-19")?.nutrients.fiberG?.amount, null);
});

test("pending logs are excluded and legacy trend days keep their totals when details are unavailable", () => {
  const result = buildInsightData(null, [{ date: "2026-09-19", meals: [
    { id: "pending", consumedAt: 0, calories: 100, protein: 3, status: "pending", items: [] },
    { id: "optimistic", consumedAt: 0, calories: 100, protein: 3, pending: "creating", items: [] },
  ] }], [{ date: "2026-09-01", calories: 1500, proteinG: 80, mealCount: 5, nutrients: {} }]);
  assert.equal(result.entries.length, 0);
  assert.equal(result.days[0].calories, 1500);
  assert.equal(result.days[1].calories, 0);
});
