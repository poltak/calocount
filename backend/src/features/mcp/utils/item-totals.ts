interface ItemAmounts {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface MealTotalChanges {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

const FIELDS = [
  ["calories", "calories"],
  ["protein", "proteinG"],
  ["carbs", "carbsG"],
  ["fat", "fatG"],
] as const;

/**
 * Keep the items equal to the corrected totals of a meal. The first item takes
 * the change. When a lower total cannot fit in the first item, the other items
 * shrink in proportion, and no amount goes below zero.
 */
export function spreadMealTotals<Item extends ItemAmounts>({
  items,
  changes,
}: {
  items: readonly Item[];
  changes: MealTotalChanges;
}): Item[] {
  const next = items.map((item) => ({ ...item }));
  const first = next[0];
  if (!first) {
    return next;
  }
  for (const [changeKey, itemKey] of FIELDS) {
    const total = changes[changeKey];
    if (total === undefined || !Number.isFinite(total) || total < 0) {
      continue;
    }
    const otherTotal = items
      .slice(1)
      .reduce((sum, item) => sum + item[itemKey], 0);
    if (total >= otherTotal) {
      first[itemKey] = total - otherTotal;
      continue;
    }
    first[itemKey] = 0;
    let remaining = total;
    for (let index = 1; index < next.length; index += 1) {
      const item = next[index];
      const original = items[index];
      if (!item || !original) {
        continue;
      }
      const amount =
        index === next.length - 1
          ? remaining
          : Math.min(remaining, (original[itemKey] / otherTotal) * total);
      item[itemKey] = amount;
      remaining -= amount;
    }
  }
  return next;
}
