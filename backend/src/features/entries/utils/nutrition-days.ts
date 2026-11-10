import { shiftDateKey } from "@app/common/features/core/utils/logical-date";
import {
  NUTRIENT_KEYS,
  NUTRIENT_UPPER_LIMIT_KEYS,
  nullableNutrientValue,
  type NutrientKey,
  type NutrientUpperLimitKey,
} from "@app/common/features/entries/utils/nutrients";
import type { MealWithItems } from "../storage/types.js";

/** How much of one nutrient the items of a day recorded, and how many items had no value. */
interface NutrientCoverage {
  recordedAmount: number | null;
  knownItemCount: number;
  totalItemCount: number;
  complete: boolean;
}

export interface NutritionDay {
  date: string;
  status: "logged" | "unlogged";
  mealCount: number;
  itemCount: number;
  totals: {
    caloriesKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  nutrients: Record<NutrientKey, NutrientCoverage>;
  sourceFormAmounts: Record<NutrientUpperLimitKey, NutrientCoverage>;
}

function coverage({
  entries,
  key,
}: {
  entries: readonly MealWithItems[];
  key: NutrientKey | NutrientUpperLimitKey;
}): NutrientCoverage {
  let recorded = 0;
  let known = 0;
  let total = 0;
  for (const { items } of entries) {
    for (const item of items) {
      total += 1;
      const value = nullableNutrientValue(item[key]);
      if (value !== null) {
        recorded += value;
        known += 1;
      }
    }
  }
  return {
    recordedAmount: known === 0 ? null : recorded,
    knownItemCount: known,
    totalItemCount: total,
    complete: total > 0 && known === total,
  };
}

/**
 * One row for each date from `startDate`, including dates with no entry. Only
 * complete entries count, and `dateKey` says which date an entry falls on.
 */
export function summariseDays({
  entries,
  startDate,
  dayCount,
  dateKey,
}: {
  entries: readonly MealWithItems[];
  startDate: string;
  dayCount: number;
  dateKey: (timestamp: number) => string;
}): NutritionDay[] {
  const byDate = new Map<string, MealWithItems[]>();
  for (const entry of entries) {
    if (entry.meal.status !== "complete") {
      continue;
    }
    const key = dateKey(entry.meal.consumedAt);
    byDate.set(key, [...(byDate.get(key) ?? []), entry]);
  }
  return Array.from({ length: dayCount }, (_, offset) => {
    const date = shiftDateKey(startDate, offset);
    const day = byDate.get(date) ?? [];
    const sum = (pick: (entry: MealWithItems) => number) =>
      day.reduce((total, entry) => total + pick(entry), 0);
    return {
      date,
      status: day.length > 0 ? "logged" : "unlogged",
      mealCount: day.length,
      itemCount: sum(({ items }) => items.length),
      totals: {
        caloriesKcal: sum(({ meal }) => meal.totalCalories),
        proteinG: sum(({ meal }) => meal.totalProteinG),
        carbsG: sum(({ meal }) => meal.totalCarbsG),
        fatG: sum(({ meal }) => meal.totalFatG),
      },
      nutrients: Object.fromEntries(
        NUTRIENT_KEYS.map((key) => [key, coverage({ entries: day, key })]),
      ) as Record<NutrientKey, NutrientCoverage>,
      sourceFormAmounts: Object.fromEntries(
        NUTRIENT_UPPER_LIMIT_KEYS.map((key) => [
          key,
          coverage({ entries: day, key }),
        ]),
      ) as Record<NutrientUpperLimitKey, NutrientCoverage>,
    } satisfies NutritionDay;
  });
}
