import assert from "node:assert/strict";
import test from "node:test";
import { mergeTrendDays, mergeTrendWeights } from "../app/dashboard-trend";

test("trend edits replace recent values and keep the older history in both ranges", () => {
  const history = Array.from({ length: 30 }, (_, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    calories: 500, proteinG: 30, carbsG: 50, fatG: 20, mealCount: 1, nutrients: {},
  }));
  const days = history.slice(-7).map(({ date }) => ({ date, calories: 0, protein: 0, meals: [] }));
  const month = mergeTrendDays({ history, days, range: 30 });
  assert.equal(month.length, 30);
  assert.equal(month[0].calories, 500);
  assert.equal(month[29].calories, 0);
  assert.equal(month[29].mealCount, 0);
  assert.deepEqual(mergeTrendDays({ history, days, range: 7 }), month.slice(-7));
  assert.equal(history[29].calories, 500);
});

test("weight changes override server history and rollback preserves gaps", () => {
  const history = [{ logicalDate: "2026-09-01", weightKg: 70, recordedAt: 1 }, { logicalDate: "2026-09-12", weightKg: 71, recordedAt: 1 }];
  const day = { date: "2026-09-12", calories: 0, protein: 0, meals: [] };
  const weights = mergeTrendWeights({ history, days: [{ ...day, weight: { logicalDate: day.date, weightKg: 72, recordedAt: 2 } }] });
  assert.equal(weights.get(day.date), 72);
  assert.equal(weights.get("2026-09-01"), 70);
  assert.equal(mergeTrendWeights({ history, days: [{ ...day, weight: null }] }).has(day.date), false);
});
