import { shiftDateKey } from "@app/common/features/core/utils/logical-date";
import type { InsightEntry } from "@app/common/features/entries/utils/insights/insight-types";
import { normalizeFoodName } from "@app/common/features/entries/utils/insights/insight-shared";

export const FOOD_CONTRIBUTION_METRICS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "fiberG", label: "Fiber", unit: "g" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
  { key: "saturatedFatG", label: "Saturated fat", unit: "g" },
] as const;

export type FoodContributionMetric =
  (typeof FOOD_CONTRIBUTION_METRICS)[number]["key"];

export interface FoodContribution {
  label: string;
  value: number;
  /** How many items of this food added to the total. */
  occurrences: number;
}

/**
 * The foods that add the most of one metric over the last `range` days that end
 * on `currentDate`. Foods group by name, and an item without an amount does not count.
 */
export function calculateFoodContributions({
  entries,
  currentDate,
  range,
  metric,
}: {
  entries: readonly InsightEntry[];
  currentDate: string;
  range: 7 | 30;
  metric: FoodContributionMetric;
}): FoodContribution[] {
  const startDate = shiftDateKey(currentDate, -(range - 1));
  const totals = new Map<string, FoodContribution>();
  for (const entry of entries) {
    if (entry.date < startDate || entry.date > currentDate) {
      continue;
    }
    for (const item of entry.items) {
      const amount =
        metric === "calories" || metric === "proteinG"
          ? item[metric]
          : item.nutrients?.[metric];
      if (
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        continue;
      }
      const key = normalizeFoodName(item.name);
      const current = totals.get(key) ?? {
        label: item.name.trim() || "Unnamed food",
        value: 0,
        occurrences: 0,
      };
      current.value += amount;
      current.occurrences += 1;
      totals.set(key, current);
    }
  }
  return [...totals.values()]
    .toSorted((left, right) => right.value - left.value)
    .slice(0, 6);
}
