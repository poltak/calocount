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

export type LoggingDay = {
  date: string;
  meals: readonly unknown[];
};

export type AverageComparison = {
  direction: "below" | "at" | "above";
  percentage: number;
};

export type AdjacentDirection = "previous" | "next";

const caloriesPerGram = {
  carbs: 4,
  protein: 4,
  fat: 9,
} as const;

function nonNegativeFinite(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function dateTimestamp(date: string) {
  const timestamp = Date.parse(`${date}T12:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function dateFromTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function calculateMacroPercentages({ carbsG, proteinG, fatG }: MacroGrams): MacroPercentages {
  const calorieValues = {
    carbs: nonNegativeFinite(carbsG) * caloriesPerGram.carbs,
    protein: nonNegativeFinite(proteinG) * caloriesPerGram.protein,
    fat: nonNegativeFinite(fatG) * caloriesPerGram.fat,
  };
  const totalCalories = calorieValues.carbs + calorieValues.protein + calorieValues.fat;
  if (totalCalories <= 0) return { carbs: 0, protein: 0, fat: 0 };

  const carbs = Math.round((calorieValues.carbs / totalCalories) * 100);
  const protein = Math.round((calorieValues.protein / totalCalories) * 100);
  return {
    carbs,
    protein,
    fat: Math.max(0, 100 - carbs - protein),
  };
}

export function calculateTargetPercent(value: number, target: number) {
  const safeValue = nonNegativeFinite(value);
  const safeTarget = nonNegativeFinite(target);
  if (safeTarget <= 0) return 0;
  return Math.min(100, Math.round((safeValue / safeTarget) * 100));
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
