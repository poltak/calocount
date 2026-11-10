import {
  NUTRIENT_KEYS,
  nullableNutrientValue,
  type NutrientKey,
} from "@app/common/features/entries/utils/nutrients";
import type { MealWithItems } from "../../entries/storage/types.js";
import {
  isPublicPhotoMimeType,
  isWithinPublicPhotoWindow,
} from "./public-photo-policy.js";

/**
 * Amounts are rounded to three places. Adding stored decimals leaves float
 * noise such as 2386.6769999999997, and three places keeps micrograms exact.
 */
export function roundAmount(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundNullable(value: unknown): number | null {
  const amount = nullableNutrientValue(value);
  return amount === null ? null : roundAmount(amount);
}

/**
 * One entry as a visitor reads it. The list of fields is explicit: a field
 * that is not here, such as the caption or the notes, never leaves the server.
 */
export function publicMeal({
  entry,
  summaryDate,
  timeZone,
}: {
  entry: MealWithItems;
  summaryDate: string;
  timeZone: string;
}) {
  const { meal, items } = entry;
  return {
    id: meal.id,
    consumedAt: meal.consumedAt,
    mealType: meal.mealType,
    // The photo route serves the entries of the last seven days only.
    hasPhoto:
      Boolean(meal.photoKey) &&
      isPublicPhotoMimeType(meal.photoMimeType) &&
      isWithinPublicPhotoWindow({
        consumedAt: meal.consumedAt,
        summaryDate,
        timeZone,
      }),
    totalCalories: roundAmount(meal.totalCalories),
    totalProteinG: roundAmount(meal.totalProteinG),
    totalCarbsG: roundAmount(meal.totalCarbsG),
    totalFatG: roundAmount(meal.totalFatG),
    items: items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      calories: roundAmount(item.calories),
      proteinG: roundAmount(item.proteinG),
      carbsG: roundAmount(item.carbsG),
      fatG: roundAmount(item.fatG),
      nutrients: Object.fromEntries(
        NUTRIENT_KEYS.map((key) => [key, roundNullable(item[key])]),
      ) as Record<NutrientKey, number | null>,
    })),
  };
}

export function publicWeight(weight: {
  logicalDate: string;
  weightKg: number;
  recordedAt: number;
}) {
  return {
    logicalDate: weight.logicalDate,
    weightKg: weight.weightKg,
    recordedAt: weight.recordedAt,
  };
}

export function publicDayTotals(day: {
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
}) {
  return {
    date: day.date,
    calories: roundAmount(day.calories),
    proteinG: roundAmount(day.proteinG),
    carbsG: roundAmount(day.carbsG),
    fatG: roundAmount(day.fatG),
    mealCount: day.mealCount,
  };
}
