import type { NutrientAggregateMap, NutrientValueMap } from "../nutrition/nutrient-meta";

/** A food or drink log; an entry does not necessarily represent a whole meal. */
export type InsightItem = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  calories: number;
  proteinG: number;
  nutrients?: NutrientValueMap;
};

export type InsightEntry = {
  id: string;
  date: string;
  consumedAt: number;
  calories: number;
  proteinG: number;
  items: InsightItem[];
};

export type InsightDay = {
  date: string;
  calories: number;
  proteinG: number;
  mealCount: number;
  nutrients: NutrientAggregateMap;
};

export type InsightHistory = {
  fromDate: string;
  toDate: string;
  entries: InsightEntry[];
};
