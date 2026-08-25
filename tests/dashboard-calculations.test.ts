import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCalorieChartScale,
  calculateLoggingStreak,
  calculateMacroPercentages,
  calculateTargetPercent,
  calculateWeightChartScale,
  compareAverageToTarget,
  getAdjacentDayKey,
} from "../app/dashboard-calculations";

test("calorie chart bars and target line use the same scale", () => {
  const scale = calculateCalorieChartScale([2337], 2100);

  assert.ok(scale.valueHeightPercents[0] > scale.targetHeightPercent);
});

test("calorie chart scale handles empty data and targets above actuals", () => {
  const emptyScale = calculateCalorieChartScale([], 0);
  assert.equal(emptyScale.maxCalories, 2600);
  assert.equal(emptyScale.targetHeightPercent, 0);
  assert.deepEqual(emptyScale.valueHeightPercents, []);

  const targetAboveActualScale = calculateCalorieChartScale([1200], 3000);
  assert.equal(targetAboveActualScale.maxCalories, 3300);
  assert.ok(targetAboveActualScale.targetHeightPercent < 100);
  assert.ok(targetAboveActualScale.valueHeightPercents[0] < targetAboveActualScale.targetHeightPercent);
});

test("calorie chart scale leaves headroom and aligns dynamic ticks with grid lines", () => {
  const scale = calculateCalorieChartScale([3000], 3000);

  assert.ok(scale.valueHeightPercents[0] < 100);
  assert.ok(scale.targetHeightPercent < 100);
  assert.deepEqual(scale.tickValues, [3300, 2541, 1782, 1023, 0]);

  [23, 46, 69].forEach((topPercent, index) => {
    const tickValue = scale.tickValues[index + 1];
    assert.ok(Math.abs(100 - (tickValue / scale.maxCalories) * 100 - topPercent) < 1e-9);
  });
});

test("weight chart scale keeps missing days as gaps and uses recorded values", () => {
  const scale = calculateWeightChartScale([73.4, null, 72.8]);

  assert.equal(scale.valueHeightPercents.length, 3);
  assert.equal(scale.valueHeightPercents[1], null);
  assert.ok((scale.valueHeightPercents[0] ?? 0) > (scale.valueHeightPercents[2] ?? 0));
  assert.equal(scale.tickValues.length, 5);
  assert.ok(scale.minWeightKg < 72.8);
  assert.ok(scale.maxWeightKg > 73.4);
});

test("empty weight chart scale has no plotted values", () => {
  const scale = calculateWeightChartScale([null, null]);

  assert.deepEqual(scale.valueHeightPercents, [null, null]);
  assert.deepEqual(scale.tickValues, []);
});

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
