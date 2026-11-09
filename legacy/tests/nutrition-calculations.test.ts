import assert from "node:assert/strict";
import test from "node:test";

import { aggregateNutrientValues } from "../app/nutrition/nutrient-meta";
import { knownAverage, trendCoverage, trendForNutrient } from "../app/nutrition/nutrition-calculations";

test("nutrient aggregation preserves explicit zero and reports partial coverage", () => {
  const values = aggregateNutrientValues([
    { fiberG: 0, sodiumMg: 100 },
    { fiberG: null, sodiumMg: 0 },
  ]);
  assert.deepEqual(values.fiberG, {
    amount: 0,
    knownItemCount: 1,
    totalItemCount: 2,
    complete: false,
  });
  assert.deepEqual(values.sodiumMg, {
    amount: 100,
    knownItemCount: 2,
    totalItemCount: 2,
    complete: true,
  });
});

test("nutrient trend keeps missing days as gaps and averages known days", () => {
  const points = trendForNutrient([
    { date: "2026-08-29", nutrients: { caffeineMg: { amount: 100, knownItemCount: 1, totalItemCount: 1, complete: true } } },
    { date: "2026-08-30", nutrients: { caffeineMg: { amount: null, knownItemCount: 0, totalItemCount: 1, complete: false } } },
    { date: "2026-08-31", nutrients: { caffeineMg: { amount: 50, knownItemCount: 1, totalItemCount: 1, complete: true } } },
  ], "caffeineMg");
  assert.deepEqual(points.map((point) => point.amount), [100, null, 50]);
  assert.equal(knownAverage(points), 75);
  assert.deepEqual(trendCoverage(points), { knownDays: 2, totalDays: 3, complete: false });
});
