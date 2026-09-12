import type { DailyWeight, TrendDay } from "./dashboard-api";

type LoggedDay = {
  date: string; calories: number; protein: number; carbs?: number; fat?: number;
  nutrients?: TrendDay["nutrients"]; meals: unknown[]; weight?: DailyWeight | null;
};

/** Recent days contain reconciled edits; older days come from the server history. */
export function mergeTrendDays({ history, days, range }: { history: TrendDay[]; days: LoggedDay[]; range: number }): TrendDay[] {
  const recent = new Map(days.map((day) => [day.date, {
    date: day.date, calories: day.calories, proteinG: day.protein,
    carbsG: day.carbs ?? 0, fatG: day.fat ?? 0, mealCount: day.meals.length,
    nutrients: day.nutrients ?? {},
  }]));
  const source = history.length ? history.map((day) => recent.get(day.date) ?? day) : [...recent.values()];
  return source.slice(-range);
}

export function mergeTrendWeights({ history, days }: { history: DailyWeight[]; days: LoggedDay[] }): Map<string, number> {
  const weights = new Map(history.map((weight) => [weight.logicalDate, weight.weightKg]));
  for (const day of days) {
    if (day.weight) weights.set(day.date, day.weight.weightKg);
    else weights.delete(day.date);
  }
  return weights;
}
