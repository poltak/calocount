import type { MealWithItems } from "../../../db/repository";

function parseJson(value: string | null | undefined, fallback: unknown) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function withoutOwnerKey<T extends { ownerKey: string }>(value: T) {
  const { ownerKey, ...rest } = value;
  void ownerKey;
  return rest;
}

export function serialiseMeal(entry: MealWithItems) {
  const { assumptionsJson, ...mealWithOwner } = entry.meal;
  const meal = withoutOwnerKey(mealWithOwner);
  return {
    ...meal,
    assumptions: parseJson(assumptionsJson, []),
    items: entry.items.map(withoutOwnerKey),
  };
}

export function serialiseMeals(entries: MealWithItems[]) {
  return entries.map(serialiseMeal);
}
