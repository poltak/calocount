import { shiftDateKey } from "@app/common/features/core/utils/logical-date";
import type { ResolvedNutrientGoal } from "@app/common/features/entries/utils/nutrient-goals";
import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";

/** The finished days that the estimates read, ending yesterday. */
const WINDOW_DAYS = 28;
const KCAL_PER_KG = 7700;
const FAT_KCAL_PER_GRAM = 9;
const MIN_MAINTENANCE_LOGGED_DAYS = 21;
const MIN_MAINTENANCE_WEIGHTS = 10;
const MIN_MAINTENANCE_SPAN_DAYS = 14;
const MIN_BALANCE_LOGGED_DAYS = 7;
const MIN_PREVIOUS_LOGGED_DAYS = 14;
const WEIGHT_AVERAGE_DAYS = 7;

interface IntakeDay {
  date: string;
  calories: number;
  fatG: number;
  mealCount: number;
}

interface DatedWeight {
  logicalDate: string;
  weightKg: number;
}

interface NutrientDay {
  date: string;
  mealCount: number;
  nutrients: Partial<Record<NutrientKey, { amount: number | null }>>;
}

export interface MaintenanceEstimate {
  kcalPerDay: number;
  fromDate: string;
  toDate: string;
}

export interface WeightChange {
  changeKg: number;
  fromDate: string;
}

export interface FourWeekBalance {
  /** The share of fat in the calories of the logged days, as a whole percent. */
  fatSharePercent: number;
  /** The same share in the 28 days before, or `null` with too few logged days. */
  previousFatSharePercent: number | null;
  /** `null` when the owner turned the goal off. */
  saturatedFat: {
    limitG: number;
    daysOver: number;
    loggedDays: number;
  } | null;
  fiber: { averageG: number | null; goalG: number | null };
}

/** Whole days from `from` to `to`. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** The 28 days that end `endOffset` days before `today`. */
function windowOf({ today, endOffset }: { today: string; endOffset: number }) {
  return {
    from: shiftDateKey(today, -(endOffset + WINDOW_DAYS - 1)),
    to: shiftDateKey(today, -endOffset),
  };
}

function loggedIn<Day extends { date: string; mealCount: number }>({
  days,
  from,
  to,
}: {
  days: readonly Day[];
  from: string;
  to: string;
}): Day[] {
  return days.filter(
    (day) => day.mealCount > 0 && day.date >= from && day.date <= to,
  );
}

/**
 * What the owner could eat each day to keep the weight, from the 28 finished
 * days: the mean intake, corrected by the change that the weights show.
 */
export function estimateMaintenance({
  today,
  days,
  weights,
}: {
  today: string;
  days: readonly IntakeDay[];
  weights: readonly DatedWeight[];
}): MaintenanceEstimate | null {
  const { from, to } = windowOf({ today, endOffset: 1 });
  const logged = loggedIn({ days, from, to });
  const inWindow = weights
    .filter((weight) => weight.logicalDate >= from && weight.logicalDate <= to)
    .toSorted((left, right) =>
      left.logicalDate.localeCompare(right.logicalDate),
    );
  const first = inWindow[0];
  const last = inWindow.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    logged.length < MIN_MAINTENANCE_LOGGED_DAYS ||
    inWindow.length < MIN_MAINTENANCE_WEIGHTS ||
    daysBetween(first.logicalDate, last.logicalDate) < MIN_MAINTENANCE_SPAN_DAYS
  ) {
    return null;
  }
  const xs = inWindow.map((weight) => daysBetween(from, weight.logicalDate));
  const ys = inWindow.map((weight) => weight.weightKg);
  const meanX = mean(xs);
  const meanY = mean(ys);
  const spread = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  const slopeKgPerDay =
    xs.reduce(
      (sum, x, index) => sum + (x - meanX) * ((ys[index] ?? 0) - meanY),
      0,
    ) / spread;
  const estimate =
    mean(logged.map((day) => day.calories)) - slopeKgPerDay * KCAL_PER_KG;
  return {
    kcalPerDay: Math.round(estimate / 10) * 10,
    fromDate: from,
    toDate: to,
  };
}

/** The mean of the first week of weights against the mean of the last week. */
export function calculateWeightChange(
  weights: readonly DatedWeight[],
): WeightChange | null {
  const sorted = weights.toSorted((left, right) =>
    left.logicalDate.localeCompare(right.logicalDate),
  );
  const first = sorted[0];
  const last = sorted.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    daysBetween(first.logicalDate, last.logicalDate) < WEIGHT_AVERAGE_DAYS
  ) {
    return null;
  }
  const firstEnd = shiftDateKey(first.logicalDate, WEIGHT_AVERAGE_DAYS - 1);
  const lastStart = shiftDateKey(last.logicalDate, -(WEIGHT_AVERAGE_DAYS - 1));
  const startMean = mean(
    sorted
      .filter((weight) => weight.logicalDate <= firstEnd)
      .map((weight) => weight.weightKg),
  );
  const endMean = mean(
    sorted
      .filter((weight) => weight.logicalDate >= lastStart)
      .map((weight) => weight.weightKg),
  );
  return { changeKg: endMean - startMean, fromDate: first.logicalDate };
}

function fatShare(days: readonly IntakeDay[]): number | null {
  const calories = days.reduce((sum, day) => sum + day.calories, 0);
  return calories > 0
    ? Math.round(
        (days.reduce((sum, day) => sum + day.fatG * FAT_KCAL_PER_GRAM, 0) /
          calories) *
          100,
      )
    : null;
}

/**
 * Fat, saturated fat and fiber over the 28 finished days, with the fat share
 * of the 28 days before. `trendDays` carry the nutrients, but they cover only
 * 30 days, so the earlier window reads `historyDays`.
 */
export function calculateFourWeekBalance({
  today,
  historyDays,
  trendDays,
  goals,
}: {
  today: string;
  historyDays: readonly IntakeDay[];
  trendDays: readonly NutrientDay[];
  goals: Record<"saturatedFatG" | "fiberG", ResolvedNutrientGoal>;
}): FourWeekBalance | null {
  const current = windowOf({ today, endOffset: 1 });
  const previous = windowOf({ today, endOffset: WINDOW_DAYS + 1 });
  const currentDays = loggedIn({ days: historyDays, ...current });
  const fatSharePercent = fatShare(currentDays);
  if (
    currentDays.length < MIN_BALANCE_LOGGED_DAYS ||
    fatSharePercent === null
  ) {
    return null;
  }
  const previousDays = loggedIn({ days: historyDays, ...previous });
  const nutrientDays = loggedIn({ days: trendDays, ...current });
  const limitG = goals.saturatedFatG.value;
  const fiberAmounts = nutrientDays.flatMap((day) => {
    const amount = day.nutrients.fiberG?.amount;
    return typeof amount === "number" ? [amount] : [];
  });
  return {
    fatSharePercent,
    previousFatSharePercent:
      previousDays.length < MIN_PREVIOUS_LOGGED_DAYS
        ? null
        : fatShare(previousDays),
    saturatedFat:
      limitG === null
        ? null
        : {
            limitG,
            daysOver: nutrientDays.filter(
              (day) => (day.nutrients.saturatedFatG?.amount ?? 0) > limitG,
            ).length,
            loggedDays: nutrientDays.length,
          },
    fiber: {
      averageG: fiberAmounts.length > 0 ? mean(fiberAmounts) : null,
      goalG: goals.fiberG.value,
    },
  };
}

/** Every date from `from` to `to`, both included. */
export function dateRange({
  from,
  to,
}: {
  from: string;
  to: string;
}): string[] {
  return Array.from(
    { length: Math.max(0, daysBetween(from, to) + 1) },
    (_, i) => shiftDateKey(from, i),
  );
}
