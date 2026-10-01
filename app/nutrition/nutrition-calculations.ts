import type { NutrientAggregateMap } from "./nutrient-meta";

export type NutrientTrendPoint = {
  date: string;
  amount: number | null;
  label: string;
};

export function trendForNutrient(
  byDate: Array<{ date: string; nutrients: NutrientAggregateMap }>,
  nutrientKey: string,
): NutrientTrendPoint[] {
  return byDate.map(({ date, nutrients }) => ({
    date,
    amount: nutrients[nutrientKey]?.amount ?? null,
    label: date,
  }));
}

export function knownAverage(points: readonly NutrientTrendPoint[]) {
  const known = points.map((point) => point.amount).filter((amount): amount is number => amount !== null && Number.isFinite(amount));
  return known.length ? known.reduce((sum, amount) => sum + amount, 0) / known.length : null;
}

export function trendCoverage(points: readonly NutrientTrendPoint[]) {
  const knownDays = points.filter((point) => point.amount !== null).length;
  return { knownDays, totalDays: points.length, complete: points.length > 0 && knownDays === points.length };
}
