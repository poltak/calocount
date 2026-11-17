import { shiftDateKey } from "@app/common/features/core/utils/logical-date";
import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";
import type { ResolvedNutrientGoal } from "@app/common/features/entries/utils/nutrient-goals";

function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

const CALORIES_PER_GRAM = { carbs: 4, protein: 4, fat: 9 } as const;

/** The share of each macro in the calories of a day, as whole percents that add up to 100. */
export function calculateMacroPercentages({
  carbsG,
  proteinG,
  fatG,
}: {
  carbsG: number;
  proteinG: number;
  fatG: number;
}) {
  const carbs = nonNegativeFinite(carbsG) * CALORIES_PER_GRAM.carbs;
  const protein = nonNegativeFinite(proteinG) * CALORIES_PER_GRAM.protein;
  const fat = nonNegativeFinite(fatG) * CALORIES_PER_GRAM.fat;
  const total = carbs + protein + fat;
  if (total <= 0) {
    return { carbs: 0, protein: 0, fat: 0 };
  }
  const carbsPercent = Math.round((carbs / total) * 100);
  const proteinPercent = Math.min(
    Math.round((protein / total) * 100),
    100 - carbsPercent,
  );
  return {
    carbs: carbsPercent,
    protein: proteinPercent,
    fat: Math.max(0, 100 - carbsPercent - proteinPercent),
  };
}

/** The macro split of each day. A day without macro calories has no data and is a gap in the chart. */
export function calculateMacroTrend(
  days: readonly {
    date: string;
    carbsG: number;
    proteinG: number;
    fatG: number;
  }[],
) {
  return days.map((day) => {
    const percentages = calculateMacroPercentages(day);
    return {
      date: day.date,
      percentages,
      hasData: percentages.carbs + percentages.protein + percentages.fat > 0,
    };
  });
}

/** The calorie-weighted macro split over all the days together. A day without macros adds nothing, so it does not pull the split. */
export function calculateMacroAverage(
  days: readonly {
    carbsG: number;
    proteinG: number;
    fatG: number;
  }[],
) {
  const totals = { carbsG: 0, proteinG: 0, fatG: 0 };
  for (const day of days) {
    totals.carbsG += nonNegativeFinite(day.carbsG);
    totals.proteinG += nonNegativeFinite(day.proteinG);
    totals.fatG += nonNegativeFinite(day.fatG);
  }
  const percentages = calculateMacroPercentages(totals);
  return {
    percentages,
    hasData: percentages.carbs + percentages.protein + percentages.fat > 0,
  };
}

export function calculateTargetPercent(value: number, target: number): number {
  const safeTarget = nonNegativeFinite(target);
  if (safeTarget <= 0) {
    return 0;
  }
  return Math.min(
    100,
    Math.round((nonNegativeFinite(value) / safeTarget) * 100),
  );
}

const DEFAULT_CHART_MAX = 2600;
const CHART_TICK_STEP = 100;
const CHART_HEADROOM_PERCENT = 10;
const CHART_GRID_LINE_TOP_PERCENTS = [23, 46, 69] as const;
const DEFAULT_CHART_TICKS = [2600, 2000, 1400, 800, 0] as const;

/** The axis of the calorie chart. The chart is at least 2,600 kcal high, and it grows with a larger value or goal. */
export function calculateCalorieChartScale(
  values: readonly number[],
  target: number,
) {
  const safeValues = values.map(nonNegativeFinite);
  const safeTarget = nonNegativeFinite(target);
  const requiredMax = Math.max(DEFAULT_CHART_MAX, safeTarget, ...safeValues);
  const withHeadroom =
    requiredMax > DEFAULT_CHART_MAX
      ? (requiredMax * (100 + CHART_HEADROOM_PERCENT)) / 100
      : DEFAULT_CHART_MAX;
  const maxCalories =
    Math.ceil(withHeadroom / CHART_TICK_STEP) * CHART_TICK_STEP;
  const targetHeightPercent = (safeTarget / maxCalories) * 100;
  return {
    targetLineTopPercent: 100 - targetHeightPercent,
    valueHeightPercents: safeValues.map((value) => (value / maxCalories) * 100),
    tickValues:
      maxCalories === DEFAULT_CHART_MAX
        ? [...DEFAULT_CHART_TICKS]
        : [
            maxCalories,
            ...CHART_GRID_LINE_TOP_PERCENTS.map(
              (top) => (maxCalories * (100 - top)) / 100,
            ),
            0,
          ],
  };
}

const PROTEIN_TICK_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500] as const;

/** The gram axis of the protein chart. It has at most four steps, and the top is above the largest value or target. */
export function calculateProteinChartScale(values: readonly number[]) {
  const largest = Math.max(1, ...values.map(nonNegativeFinite)) * 1.05;
  const step =
    PROTEIN_TICK_STEPS.find((candidate) => largest / candidate <= 4) ??
    Math.ceil(largest / 4);
  const steps = Math.ceil(largest / step);
  return {
    max: steps * step,
    ticks: Array.from(
      { length: steps + 1 },
      (_, index) => (steps - index) * step,
    ),
  };
}

/** How far the average is from the goal, as the card under the average says it. */
export function compareAverageToTarget(
  averageCalories: number,
  targetCalories: number,
): { direction: "below" | "at" | "above"; percentage: number } {
  const average = nonNegativeFinite(averageCalories);
  const target = nonNegativeFinite(targetCalories);
  if (target <= 0) {
    return { direction: average === 0 ? "at" : "above", percentage: 0 };
  }
  const difference = average - target;
  if (difference === 0) {
    return { direction: "at", percentage: 0 };
  }
  return {
    direction: difference < 0 ? "below" : "above",
    percentage: Math.round((Math.abs(difference) / target) * 100),
  };
}

export type CalorieDayStatus = "under" | "near" | "over" | "in-progress";

/**
 * How a day compares with the calorie goal: under 95% is under, 105% and
 * below is near, above that is over. Today is still in progress, so it has no
 * verdict until it is over the goal.
 */
export function calorieDayStatus({
  calories,
  goal,
  isToday,
}: {
  calories: number;
  goal: number;
  isToday: boolean;
}): CalorieDayStatus {
  const ratio = goal > 0 ? calories / goal : 1;
  if (ratio > 1.05) {
    return "over";
  }
  if (isToday) {
    return "in-progress";
  }
  return ratio < 0.95 ? "under" : "near";
}

/** The days in a row that have an entry, counted back from `endDate`. A day that the list lacks ends the count. */
export function calculateLoggingStreak({
  days,
  endDate,
}: {
  days: readonly { date: string; mealCount: number }[];
  endDate: string;
}): number {
  const mealCountByDate = new Map(days.map((day) => [day.date, day.mealCount]));
  let streak = 0;
  for (
    let date = endDate;
    (mealCountByDate.get(date) ?? 0) > 0;
    date = shiftDateKey(date, -1)
  ) {
    streak += 1;
  }
  return streak;
}

/** The nutrients that the consistency matrix shows, in row order. */
export const MATRIX_NUTRIENTS: readonly NutrientKey[] = [
  "fiberG",
  "saturatedFatG",
  "sodiumMg",
  "potassiumMg",
  "calciumMg",
  "ironMg",
];

export type MatrixCellState = "unknown" | "met" | "over" | "low";

/**
 * How one day went against the goal of one nutrient. `progress` is a percent
 * of the goal, and `coverage` is the share of items that had a value.
 */
export function calculateMatrixCell({
  aggregate,
  goal,
}: {
  aggregate: {
    amount: number | null;
    knownItemCount: number;
    totalItemCount: number;
  };
  goal: ResolvedNutrientGoal;
}): {
  state: MatrixCellState;
  progress: number | null;
  intensity: number;
  coverage: number;
} {
  const { amount } = aggregate;
  const progress =
    typeof amount === "number" && goal.value
      ? (amount / goal.value) * 100
      : null;
  const met =
    progress !== null &&
    (goal.direction === "minimum" ? progress >= 100 : progress <= 100);
  const state: MatrixCellState =
    progress === null
      ? "unknown"
      : met
        ? "met"
        : goal.direction === "maximum"
          ? "over"
          : "low";
  return {
    state,
    progress,
    intensity: progress === null ? 0 : Math.min(100, Math.max(12, progress)),
    coverage:
      aggregate.totalItemCount > 0
        ? aggregate.knownItemCount / aggregate.totalItemCount
        : 0,
  };
}
