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
