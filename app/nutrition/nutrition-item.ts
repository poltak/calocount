import type { NutrientProvenanceMap } from "../../domain/nutrient-provenance";
import type { NutrientValueMap } from "./nutrient-meta";

/** One food or drink of an entry, with the nutrients recorded for it. */
export type NutritionItem = {
  id?: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  nutrients?: NutrientValueMap;
  nutrientProvenance?: NutrientProvenanceMap;
  source?: string | null;
  confidence?: string | number | null;
};

export type NutritionMeal = {
  id: string;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs?: number | null;
  fat?: number | null;
  photoUrl?: string | null;
  items: NutritionItem[];
};
