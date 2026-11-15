import {
  NUTRIENT_KEYS,
  NUTRIENT_UPPER_LIMIT_KEYS,
  nullableNutrientValue,
  type NutrientValues,
} from "@app/common/features/entries/utils/nutrients";
import type { InsightEntry } from "@app/common/features/entries/utils/insights/insight-types";
import type { MealWithItems } from "../storage/types.js";
import { storedProvenance } from "./entry-rows.js";

/** An entry as the insight panels read it: the totals, and the items with every tracked nutrient. */
export function insightEntryOf({
  entry: { meal, items },
  date,
}: {
  entry: MealWithItems;
  date: string;
}): InsightEntry {
  return {
    id: meal.id,
    date,
    consumedAt: meal.consumedAt,
    calories: meal.totalCalories,
    proteinG: meal.totalProteinG,
    items: items.map((item) => {
      const nutrients = {} as NutrientValues;
      for (const key of [...NUTRIENT_KEYS, ...NUTRIENT_UPPER_LIMIT_KEYS]) {
        nutrients[key] = nullableNutrientValue(item[key]);
      }
      const nutrientProvenance = storedProvenance(item);
      return {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        proteinG: item.proteinG,
        nutrients,
        ...(Object.keys(nutrientProvenance).length > 0
          ? { nutrientProvenance }
          : {}),
      };
    }),
  };
}
