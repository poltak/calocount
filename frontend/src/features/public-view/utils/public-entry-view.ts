import {
  entryKind,
  entryKindLabels,
  type EntryKind,
} from "@app/common/features/entries/utils/entry-kind";
import { clockTime } from "../../core/utils/dashboard-format.js";
import type { PublicDay } from "./public-types.js";

/** An entry as the public page lists it: only what the public JSON carries. */
export interface PublicEntryView {
  id: string;
  time: string;
  name: string;
  description: string;
  kind: EntryKind | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function publicEntryViewOf({
  meal,
  timeZone,
}: {
  meal: PublicDay["meals"][number];
  timeZone: string;
}): PublicEntryView {
  const kind = entryKind(meal.mealType);
  const itemNames = meal.items.map((item) => item.name).filter(Boolean);
  return {
    id: meal.id,
    time: clockTime(meal.consumedAt, timeZone),
    name: itemNames[0] || (kind ? `${entryKindLabels[kind]} entry` : "Entry"),
    description: itemNames.join(", "),
    kind,
    calories: meal.totalCalories,
    protein: meal.totalProteinG,
    carbs: meal.totalCarbsG,
    fat: meal.totalFatG,
  };
}
