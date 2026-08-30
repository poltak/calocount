export type MacroGrams = {
  carbsG: number;
  proteinG: number;
  fatG: number;
};

export type MacroPercentages = {
  carbs: number;
  protein: number;
  fat: number;
};

export type MacroTrendInput = MacroGrams & {
  date: string;
};

export type MacroTrendDay = {
  date: string;
  totalCalories: number;
  percentages: MacroPercentages;
  hasData: boolean;
};

export type LoggingDay = {
  date: string;
  meals: readonly unknown[];
};

export type AverageComparison = {
  direction: "below" | "at" | "above";
  percentage: number;
};

export type SevenDayAverageInput = {
  date: string;
  value: number;
};

export type SevenDayAverageOptions = {
  days: readonly SevenDayAverageInput[];
  currentDate: string;
  now?: Date;
  timeZone: string;
};

export type AdjacentDirection = "previous" | "next";

export type CalorieChartScale = {
  maxCalories: number;
  targetHeightPercent: number;
  targetLineTopPercent: number;
  valueHeightPercents: readonly number[];
  tickValues: readonly number[];
};

export type WeightChartScale = {
  minWeightKg: number;
  maxWeightKg: number;
  valueHeightPercents: readonly (number | null)[];
  tickValues: readonly number[];
};

const caloriesPerGram = {
  carbs: 4,
  protein: 4,
  fat: 9,
} as const;

const defaultCalorieChartMax = 2600;
const calorieChartTickStep = 100;
const calorieChartHeadroomPercent = 10;
const calorieChartGridLineTopPercents = [23, 46, 69] as const;
const defaultCalorieChartTicks = [2600, 2000, 1400, 800, 0] as const;
const sevenDayAverageCutoffHour = 21;

function nonNegativeFinite(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function macroCalorieValues({ carbsG, proteinG, fatG }: MacroGrams) {
  return {
    carbs: nonNegativeFinite(carbsG) * caloriesPerGram.carbs,
    protein: nonNegativeFinite(proteinG) * caloriesPerGram.protein,
    fat: nonNegativeFinite(fatG) * caloriesPerGram.fat,
  };
}

function totalMacroCalories(values: ReturnType<typeof macroCalorieValues>) {
  return values.carbs + values.protein + values.fat;
}

function dateTimestamp(date: string) {
  const timestamp = Date.parse(`${date}T12:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function dateFromTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function calculateMacroPercentages({ carbsG, proteinG, fatG }: MacroGrams): MacroPercentages {
  const calorieValues = macroCalorieValues({ carbsG, proteinG, fatG });
  const totalCalories = totalMacroCalories(calorieValues);
  if (totalCalories <= 0) return { carbs: 0, protein: 0, fat: 0 };

  const carbs = Math.round((calorieValues.carbs / totalCalories) * 100);
  const roundedProtein = Math.round((calorieValues.protein / totalCalories) * 100);
  const protein = Math.min(roundedProtein, 100 - carbs);
  return {
    carbs,
    protein,
    fat: Math.max(0, 100 - carbs - protein),
  };
}

export function calculateMacroTrend(days: readonly MacroTrendInput[]): MacroTrendDay[] {
  return days.map((day) => {
    const calorieValues = macroCalorieValues(day);
    const totalCalories = totalMacroCalories(calorieValues);
    return {
      date: day.date,
      totalCalories,
      percentages: calculateMacroPercentages(day),
      hasData: totalCalories > 0,
    };
  });
}

export function calculateTargetPercent(value: number, target: number) {
  const safeValue = nonNegativeFinite(value);
  const safeTarget = nonNegativeFinite(target);
  if (safeTarget <= 0) return 0;
  return Math.min(100, Math.round((safeValue / safeTarget) * 100));
}

export function calculateCalorieChartScale(values: readonly number[], target: number): CalorieChartScale {
  const safeValues = values.map(nonNegativeFinite);
  const safeTarget = nonNegativeFinite(target);
  const requiredMax = Math.max(defaultCalorieChartMax, safeTarget, ...safeValues);
  const maxWithHeadroom = requiredMax > defaultCalorieChartMax
    ? (requiredMax * (100 + calorieChartHeadroomPercent)) / 100
    : defaultCalorieChartMax;
  const maxCalories = Math.ceil(maxWithHeadroom / calorieChartTickStep) * calorieChartTickStep;
  const toHeightPercent = (value: number) => (value / maxCalories) * 100;
  const targetHeightPercent = toHeightPercent(safeTarget);
  const tickValues = maxCalories === defaultCalorieChartMax
    ? defaultCalorieChartTicks
    : [
      maxCalories,
      ...calorieChartGridLineTopPercents.map((topPercent) => (maxCalories * (100 - topPercent)) / 100),
      0,
    ];

  return {
    maxCalories,
    targetHeightPercent,
    targetLineTopPercent: 100 - targetHeightPercent,
    valueHeightPercents: safeValues.map(toHeightPercent),
    tickValues,
  };
}

export function calculateWeightChartScale(values: readonly (number | null)[]): WeightChartScale {
  const finiteValues = values.filter((value): value is number => (
    typeof value === "number" && Number.isFinite(value) && value > 0
  ));
  if (finiteValues.length === 0) {
    return {
      minWeightKg: 0,
      maxWeightKg: 0,
      valueHeightPercents: values.map(() => null),
      tickValues: [],
    };
  }

  const observedMin = Math.min(...finiteValues);
  const observedMax = Math.max(...finiteValues);
  const padding = Math.max((observedMax - observedMin) * 0.2, 0.5);
  const minWeightKg = Math.max(0, Math.floor((observedMin - padding) * 10) / 10);
  const maxWeightKg = Math.ceil((observedMax + padding) * 10) / 10;
  const range = Math.max(maxWeightKg - minWeightKg, 1);
  const valueHeightPercents = values.map((value) => (
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? ((value - minWeightKg) / range) * 100
      : null
  ));
  const tickValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => (
    Math.round((minWeightKg + range * ratio) * 10) / 10
  )).reverse();

  return {
    minWeightKg,
    maxWeightKg,
    valueHeightPercents,
    tickValues,
  };
}

export function calculateLoggingStreak(days: readonly LoggingDay[], endDate?: string) {
  const validDays = days.flatMap((day) => {
    const timestamp = dateTimestamp(day.date);
    return timestamp === null ? [] : [{ ...day, timestamp }];
  });
  if (validDays.length === 0) return 0;

  const daysByDate = new Map(validDays.map((day) => [dateFromTimestamp(day.timestamp), day]));
  const requestedEndTimestamp = endDate === undefined ? null : dateTimestamp(endDate);
  const latestTimestamp = Math.max(...validDays.map((day) => day.timestamp));
  const startTimestamp = requestedEndTimestamp ?? latestTimestamp;
  if (!daysByDate.has(dateFromTimestamp(startTimestamp))) return 0;

  let streak = 0;
  for (let timestamp = startTimestamp; ; timestamp -= 86_400_000) {
    const day = daysByDate.get(dateFromTimestamp(timestamp));
    if (!day || day.meals.length === 0) break;
    streak += 1;
  }
  return streak;
}

export function compareAverageToTarget(averageCalories: number, targetCalories: number): AverageComparison {
  const average = nonNegativeFinite(averageCalories);
  const target = nonNegativeFinite(targetCalories);
  if (target <= 0) return { direction: average === 0 ? "at" : "above", percentage: 0 };

  const difference = average - target;
  if (difference === 0) return { direction: "at", percentage: 0 };
  return {
    direction: difference < 0 ? "below" : "above",
    percentage: Math.round((Math.abs(difference) / target) * 100),
  };
}

function hourInTimeZone(now: Date, timeZone: string) {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).formatToParts(now).find((part) => part.type === "hour")?.value;
    return Number(hour ?? Number.NaN);
  } catch {
    return now.getHours();
  }
}

export function calculateSevenDayAverage({ days, currentDate, now = new Date(), timeZone }: SevenDayAverageOptions) {
  const includeCurrentDay = hourInTimeZone(now, timeZone) >= sevenDayAverageCutoffHour;
  const includedDays = includeCurrentDay
    ? days
    : days.filter((day) => day.date !== currentDate);
  if (includedDays.length === 0) return 0;

  return Math.round(includedDays.reduce((total, day) => total + nonNegativeFinite(day.value), 0) / includedDays.length);
}

export function getAdjacentDayKey<T extends { key: string }>(
  days: readonly T[],
  selectedKey: string,
  direction: AdjacentDirection,
) {
  const selectedIndex = days.findIndex((day) => day.key === selectedKey);
  if (selectedIndex < 0) return null;
  const offset = direction === "previous" ? -1 : 1;
  return days[selectedIndex + offset]?.key ?? null;
}
