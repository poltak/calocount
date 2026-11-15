import { shiftDateKey } from "../../../core/utils/logical-date.js";
import type { NutrientGoalMap } from "../nutrient-goals.js";
import type { InsightDay, ProteinTargetOfDate } from "./insight-types.js";
export type RepeatMetric = "protein" | "fiber";
export type Coverage = "complete" | "partial" | "unknown";

export type RepeatPoint = {
  date: string;
  calories: number;
  caloriePercent: number | null;
  value: number | null;
  target: number | null;
  percent: number | null;
  coverage: Coverage;
  targetMet: boolean | null;
  inCalorieBand: boolean;
  meetsBothTargets: boolean;
};

export type RepeatAxisScale = { max: number; ticks: number[] };

export function repeatAxisScale(
  values: readonly (number | null)[],
  minimumMax = 150,
): RepeatAxisScale {
  const largest = Math.max(
    minimumMax,
    ...values.filter(
      (value): value is number =>
        value !== null && Number.isFinite(value) && value >= 0,
    ),
  );
  const max = Math.ceil(largest / 25) * 25;
  return { max, ticks: [...new Set([0, 100, max])].toSorted((a, b) => a - b) };
}

export function axisPosition(value: number, scale: RepeatAxisScale) {
  return (value / scale.max) * 100;
}

export function resolveProteinTarget(
  date: string,
  goals: readonly ProteinTargetOfDate[],
  fallback: number | null,
): number | null {
  const datedGoal = goals.find((goal) => goal.date === date);
  if (datedGoal) {
    return validTarget(datedGoal.targetG);
  }
  return validTarget(fallback);
}

function validTarget(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function fiberCoverage(day: InsightDay): Coverage {
  const aggregate = day.nutrients.fiberG;
  if (
    !aggregate ||
    aggregate.amount === null ||
    aggregate.knownItemCount === 0
  ) {
    return "unknown";
  }
  return aggregate.complete ? "complete" : "partial";
}

export function buildRepeatPoints({
  days,
  currentDate,
  range,
  calorieTarget,
  proteinGoals,
  fallbackProteinTarget,
  nutrientGoals,
  metric,
  calorieBand,
}: {
  days: readonly InsightDay[];
  currentDate: string;
  range: 7 | 30;
  calorieTarget: number | null;
  proteinGoals: readonly ProteinTargetOfDate[];
  fallbackProteinTarget: number | null;
  nutrientGoals: NutrientGoalMap;
  metric: RepeatMetric;
  calorieBand: readonly [number, number];
}): RepeatPoint[] {
  const rangeStart = shiftDateKey(currentDate, -range);
  const eligible = days
    .filter(
      (day) =>
        day.date >= rangeStart && day.date < currentDate && day.mealCount > 0,
    )
    .toSorted((a, b) => a.date.localeCompare(b.date));
  const calorieGoal = validTarget(calorieTarget);

  return eligible.map((day) => {
    const target =
      metric === "protein"
        ? resolveProteinTarget(day.date, proteinGoals, fallbackProteinTarget)
        : validTarget(nutrientGoals.fiberG?.value);
    const aggregate = day.nutrients.fiberG;
    const value =
      metric === "protein" ? day.proteinG : (aggregate?.amount ?? null);
    const coverage = metric === "protein" ? "complete" : fiberCoverage(day);
    const caloriePercent = calorieGoal
      ? (day.calories / calorieGoal) * 100
      : null;
    const percent =
      target && value !== null && Number.isFinite(value)
        ? (value / target) * 100
        : null;
    const inCalorieBand =
      caloriePercent !== null &&
      caloriePercent >= calorieBand[0] &&
      caloriePercent <= calorieBand[1];
    const targetMet =
      percent === null || coverage === "unknown" ? null : percent >= 100;
    return {
      date: day.date,
      calories: day.calories,
      caloriePercent,
      value,
      target,
      percent,
      coverage,
      targetMet,
      inCalorieBand,
      meetsBothTargets: inCalorieBand && targetMet === true,
    };
  });
}

export function repeatPointCounts(points: readonly RepeatPoint[]) {
  return {
    displayed: points.filter(
      (point) => point.caloriePercent !== null && point.percent !== null,
    ).length,
    unknownCalories: points.filter((point) => point.caloriePercent === null)
      .length,
    unknownMetric: points.filter((point) => point.percent === null).length,
    partialMetric: points.filter((point) => point.coverage === "partial")
      .length,
  };
}
