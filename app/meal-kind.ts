/** The entry types the dashboard can set. An entry may also have no type. */
export const MEAL_KINDS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealKind = (typeof MEAL_KINDS)[number];

export const mealKindLabels: Record<MealKind, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** Read a stored entry type. Anything the dashboard does not know counts as no type. */
export function mealKind(value: string | null | undefined): MealKind | null {
  return (MEAL_KINDS as readonly string[]).includes(value ?? "") ? value as MealKind : null;
}

/** Suggest a type for a new entry from its HH:MM time. */
export function mealKindForTime(time: string): MealKind {
  const hour = Number(time.slice(0, 2));
  if (!Number.isFinite(hour)) return "snack";
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 17 && hour < 22) return "dinner";
  return "snack";
}
