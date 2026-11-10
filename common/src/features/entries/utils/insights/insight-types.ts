import type { NutrientAggregateMap, NutrientValues } from "../nutrients.js";
import type { NutrientProvenanceMap } from "../nutrient-provenance.js";

/** The tracked amounts of one item. A key that is missing or `null` is unknown. */
export type InsightNutrients = {
  [Key in keyof NutrientValues]?: number | null | undefined;
};

/** Where each amount came from. A key that is missing has no recorded origin. */
export type InsightProvenance = {
  [Key in keyof NutrientProvenanceMap]?: NutrientProvenanceMap[Key] | undefined;
};

/** A food or drink log; an entry does not necessarily represent a whole meal. */
export interface InsightItem {
  name: string;
  quantity?: number | null | undefined;
  unit?: string | null | undefined;
  calories: number;
  proteinG: number;
  nutrients?: InsightNutrients | undefined;
  nutrientProvenance?: InsightProvenance | undefined;
}

export interface InsightEntry {
  id: string;
  date: string;
  consumedAt: number;
  calories: number;
  proteinG: number;
  items: InsightItem[];
}

export interface InsightDay {
  date: string;
  calories: number;
  proteinG: number;
  mealCount: number;
  nutrients: NutrientAggregateMap;
}

/** The finished days before today, and today, with the complete entries of those days. */
export interface InsightHistory {
  fromDate: string;
  toDate: string;
  entries: InsightEntry[];
}

/** The protein target that a date had, or `null` when it had none. */
export interface ProteinTargetOfDate {
  date: string;
  targetG: number | null;
}
