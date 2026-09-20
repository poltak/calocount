import { aggregateNutrientValues } from "../nutrition/nutrient-meta";
import type { InsightDay, InsightEntry, InsightHistory, InsightItem } from "./types";

type LiveDay = {
  date: string;
  meals: Array<{
    id: string;
    consumedAt: number;
    calories: number;
    protein: number;
    status?: string;
    pending?: string;
    items: Array<Omit<InsightItem, "calories" | "proteinG"> & { calories?: number; proteinG?: number }>;
  }>;
};

/** Replace loaded dates wholesale so edits and deletions cannot leave stale entries. */
export function buildInsightData(history: InsightHistory | null, liveDays: LiveDay[], fallbackDays: InsightDay[]) {
  const liveDates = new Set(liveDays.map((day) => day.date));
  const entries: InsightEntry[] = [
    ...(history?.entries ?? []).filter((entry) => !liveDates.has(entry.date)),
    ...liveDays.flatMap((day) => day.meals.filter((entry) => !entry.pending && (!entry.status || entry.status === "complete")).map((entry) => ({
      id: entry.id,
      date: day.date,
      consumedAt: entry.consumedAt,
      calories: entry.calories,
      proteinG: entry.protein,
      items: entry.items.map((item) => ({ ...item, calories: item.calories ?? 0, proteinG: item.proteinG ?? 0 })),
    }))),
  ];
  const entriesByDate = new Map<string, InsightEntry[]>();
  for (const entry of entries) {
    const dayEntries = entriesByDate.get(entry.date) ?? [];
    dayEntries.push(entry);
    entriesByDate.set(entry.date, dayEntries);
  }
  const days = new Map(fallbackDays.map((day) => [day.date, day]));
  const datesToCalculate = new Set(liveDates);
  if (history) {
    for (let timestamp = Date.parse(history.fromDate); timestamp <= Date.parse(history.toDate); timestamp += 86_400_000) {
      datesToCalculate.add(new Date(timestamp).toISOString().slice(0, 10));
    }
  }
  for (const date of datesToCalculate) {
    const dayEntries = entriesByDate.get(date) ?? [];
    days.set(date, {
      date,
      calories: dayEntries.reduce((sum, entry) => sum + entry.calories, 0),
      proteinG: dayEntries.reduce((sum, entry) => sum + entry.proteinG, 0),
      mealCount: dayEntries.length,
      nutrients: aggregateNutrientValues(dayEntries.flatMap((entry) => entry.items.map((item) => item.nutrients ?? {}))),
    });
  }
  return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), entries };
}
