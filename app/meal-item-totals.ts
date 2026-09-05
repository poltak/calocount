import type { NutritionItem } from "./nutrition/meal-nutrition-details";

type TotalChanges = {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  name?: string;
};

/** Keep item totals consistent with the edited meal totals sent to the API. */
export function updateMealItemTotals({ items, changes }: {
  items: readonly NutritionItem[];
  changes: TotalChanges;
}): NutritionItem[] {
  const nextItems = items.map((item) => ({ ...item }));
  const first = nextItems[0];
  if (!first) return nextItems;
  if (typeof changes.name === "string") first.name = changes.name;

  const fields = [
    ["calories", "calories"],
    ["protein", "proteinG"],
    ["carbs", "carbsG"],
    ["fat", "fatG"],
  ] as const;
  for (const [mealKey, itemKey] of fields) {
    const total = changes[mealKey];
    if (typeof total !== "number" || !Number.isFinite(total) || total < 0) continue;
    const otherTotal = items.slice(1).reduce((sum, item) => sum + (item[itemKey] ?? 0), 0);
    if (total >= otherTotal) {
      first[itemKey] = total - otherTotal;
      continue;
    }

    // The first item cannot absorb this reduction. Scale the other items
    // down to the requested total, keeping their relative contributions.
    first[itemKey] = 0;
    let remaining = total;
    for (let index = 1; index < nextItems.length; index += 1) {
      const amount = index === nextItems.length - 1
        ? remaining
        : Math.min(remaining, ((items[index][itemKey] ?? 0) / otherTotal) * total);
      nextItems[index][itemKey] = amount;
      remaining -= amount;
    }
  }
  return nextItems;
}
