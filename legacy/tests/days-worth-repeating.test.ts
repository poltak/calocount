import assert from "node:assert/strict";
import test from "node:test";
import { resolveNutrientGoals } from "../domain/nutrient-goals";
import { axisPosition, buildRepeatPoints, fiberCoverage, repeatAxisScale, resolveProteinTarget } from "../app/insights/days-worth-repeating-calculations";
import type { InsightDay } from "../app/insights/types";

const day = (date: string, calories = 2_000, fiber: { amount: number | null; knownItemCount: number; totalItemCount: number; complete: boolean } = { amount: 28, knownItemCount: 2, totalItemCount: 2, complete: true }): InsightDay => ({
  date, calories, proteinG: 100, mealCount: 2, nutrients: { fiberG: fiber },
});

const base = { currentDate: "2026-09-19", range: 30 as const, calorieTarget: 2_000, proteinGoals: [], fallbackProteinTarget: 100, nutrientGoals: resolveNutrientGoals(), metric: "protein" as const, calorieBand: [90, 110] as const };

test("excludes current, future, and unlogged days and applies inclusive calorie bands", () => {
  const unlogged = day("2026-09-17"); unlogged.mealCount = 0;
  const points = buildRepeatPoints({ ...base, days: [day("2026-09-18", 1_800), unlogged, day("2026-09-19"), day("2026-09-20")] });
  assert.deepEqual(points.map((point) => point.date), ["2026-09-18"]);
  assert.equal(points[0].inCalorieBand, true);
  assert.equal(points[0].caloriePercent, 90);
});

test("the 7-day range uses calendar days ending yesterday rather than seven logged days", () => {
  const dates = ["2026-09-11", "2026-09-12", "2026-09-13", "2026-09-18"];
  const points = buildRepeatPoints({ ...base, range: 7, days: dates.map((date) => day(date)) });
  assert.deepEqual(points.map((point) => point.date), ["2026-09-12", "2026-09-13", "2026-09-18"]);
});

test("an explicit null per-day protein goal does not use the fallback", () => {
  const goals = [{ date: "2026-09-18", targetG: null, weightKg: null, weightDate: null }];
  assert.equal(resolveProteinTarget("2026-09-18", goals, 100), null);
  assert.equal(resolveProteinTarget("2026-09-17", goals, 100), 100);
  const [point] = buildRepeatPoints({ ...base, days: [day("2026-09-18")], proteinGoals: goals });
  assert.equal(point.percent, null);
});

test("fiber preserves complete, partial, and unknown coverage", () => {
  const complete = day("2026-09-16");
  const partial = day("2026-09-17", 2_000, { amount: 20, knownItemCount: 1, totalItemCount: 2, complete: false });
  const unknown = day("2026-09-18", 2_000, { amount: null, knownItemCount: 0, totalItemCount: 2, complete: false });
  assert.equal(fiberCoverage(complete), "complete");
  assert.equal(fiberCoverage(partial), "partial");
  assert.equal(fiberCoverage(unknown), "unknown");
  const points = buildRepeatPoints({ ...base, days: [complete, partial, unknown], metric: "fiber" });
  assert.deepEqual(points.map((point) => [point.coverage, point.targetMet]), [["complete", true], ["partial", false], ["unknown", null]]);
});

test("axis scaling accommodates outliers without clamping and keeps a true 100% reference", () => {
  const scale = repeatAxisScale([80, 100, 241]);
  assert.deepEqual(scale, { max: 250, ticks: [0, 100, 250] });
  assert.equal(axisPosition(100, scale), 40);
  assert.ok(Math.abs(axisPosition(241, scale) - 96.4) < 0.000_001);
});

test("joint goal status requires both the calorie band and vertical target", () => {
  const points = buildRepeatPoints({ ...base, days: [day("2026-09-16", 2_000), { ...day("2026-09-17", 2_000), proteinG: 80 }, day("2026-09-18", 2_400)] });
  assert.deepEqual(points.map((point) => [point.inCalorieBand, point.targetMet, point.meetsBothTargets]), [
    [true, true, true],
    [true, false, false],
    [false, true, false],
  ]);
});
