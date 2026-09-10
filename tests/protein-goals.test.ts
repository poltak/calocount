import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProteinGoalSummary,
  calculateProteinTargetG,
  isValidProteinPerKg,
  PROTEIN_PER_KG_MAX,
  PROTEIN_PER_KG_MIN,
  resolveProteinGoalDay,
} from "../domain/protein-goals";

test("fixed protein goals ignore weight history", () => {
  assert.deepEqual(resolveProteinGoalDay({
    date: "2026-09-10",
    mode: "grams",
    fixedTargetG: 160,
    gramsPerKg: null,
    weights: [{ logicalDate: "2026-09-10", weightKg: 80 }],
  }), {
    date: "2026-09-10",
    targetG: 160,
    weightKg: null,
    weightDate: null,
  });
});

test("per-kilogram goals use exact weight, then the latest earlier weight", () => {
  const weights = [
    { logicalDate: "2026-09-10", weightKg: 80 },
    { logicalDate: "2026-09-08", weightKg: 75 },
    { logicalDate: "2026-09-11", weightKg: 100 },
  ];
  assert.equal(calculateProteinTargetG({ weightKg: 80, gramsPerKg: 1.5 }), 120);
  assert.deepEqual(resolveProteinGoalDay({
    date: "2026-09-09",
    mode: "gramsPerKg",
    fixedTargetG: 160,
    gramsPerKg: 1.5,
    weights,
  }), {
    date: "2026-09-09",
    targetG: 112.5,
    weightKg: 75,
    weightDate: "2026-09-08",
  });
  assert.equal(resolveProteinGoalDay({
    date: "2026-09-10",
    mode: "gramsPerKg",
    fixedTargetG: 160,
    gramsPerKg: 1.5,
    weights,
  }).targetG, 120);
  assert.equal(resolveProteinGoalDay({
    date: "2026-09-07",
    mode: "gramsPerKg",
    fixedTargetG: 160,
    gramsPerKg: 1.5,
    weights,
  }).targetG, null);
});

test("per-kilogram goal summaries keep no-weight days unavailable", () => {
  const summary = buildProteinGoalSummary({
    dates: ["2026-09-09", "2026-09-10"],
    mode: "gramsPerKg",
    fixedTargetG: 160,
    gramsPerKg: 1.6,
    weights: [],
  });
  assert.equal(summary.targetG, null);
  assert.deepEqual(summary.byDate, [
    { date: "2026-09-09", targetG: null, weightKg: null, weightDate: null },
    { date: "2026-09-10", targetG: null, weightKg: null, weightDate: null },
  ]);
});

test("per-kilogram validation accepts the configured range and rejects unsafe values", () => {
  assert.equal(isValidProteinPerKg(PROTEIN_PER_KG_MIN), true);
  assert.equal(isValidProteinPerKg(PROTEIN_PER_KG_MAX), true);
  assert.equal(isValidProteinPerKg(PROTEIN_PER_KG_MIN - 0.1), false);
  assert.equal(isValidProteinPerKg(PROTEIN_PER_KG_MAX + 0.1), false);
  assert.equal(isValidProteinPerKg(Number.NaN), false);
  assert.equal(calculateProteinTargetG({ weightKg: 80, gramsPerKg: 0.1 }), null);
});
