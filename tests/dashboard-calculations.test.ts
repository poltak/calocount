import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateLoggingStreak,
  calculateMacroPercentages,
  calculateTargetPercent,
  compareAverageToTarget,
  getAdjacentDayKey,
} from "../app/dashboard-calculations";

test("macro percentages use calorie values and total 100", () => {
  assert.deepEqual(
    calculateMacroPercentages({ carbsG: 50, proteinG: 25, fatG: 10 }),
    { carbs: 51, protein: 26, fat: 23 },
  );
});

test("empty macro data returns zero percentages", () => {
  assert.deepEqual(
    calculateMacroPercentages({ carbsG: 0, proteinG: 0, fatG: 0 }),
    { carbs: 0, protein: 0, fat: 0 },
  );
});

test("logging streak counts consecutive logged days ending on the selected day", () => {
  const days = [
    { date: "2025-06-08", meals: [{}] },
    { date: "2025-06-09", meals: [{}] },
    { date: "2025-06-10", meals: [] },
    { date: "2025-06-11", meals: [{}] },
    { date: "2025-06-12", meals: [{}] },
  ];
  assert.equal(calculateLoggingStreak(days, "2025-06-12"), 2);
  assert.equal(calculateLoggingStreak(days, "2025-06-10"), 0);
});

test("average comparison reports relative distance from target", () => {
  assert.deepEqual(compareAverageToTarget(2300, 2400), { direction: "below", percentage: 4 });
  assert.deepEqual(compareAverageToTarget(2500, 2400), { direction: "above", percentage: 4 });
  assert.deepEqual(compareAverageToTarget(2400, 2400), { direction: "at", percentage: 0 });
});

test("target progress is safe when the target is zero", () => {
  assert.equal(calculateTargetPercent(1200, 0), 0);
  assert.deepEqual(compareAverageToTarget(1200, 0), { direction: "above", percentage: 0 });
});

test("adjacent navigation stops at the loaded week boundaries", () => {
  const days = [{ key: "sun" }, { key: "mon" }, { key: "tue" }];
  assert.equal(getAdjacentDayKey(days, "mon", "previous"), "sun");
  assert.equal(getAdjacentDayKey(days, "mon", "next"), "tue");
  assert.equal(getAdjacentDayKey(days, "sun", "previous"), null);
  assert.equal(getAdjacentDayKey(days, "tue", "next"), null);
});
