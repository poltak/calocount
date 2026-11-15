import { shiftDateKey } from "../../../core/utils/logical-date.js";
import { aggregateNutrients } from "../nutrients.js";
import type {
  InsightDay,
  InsightEntry,
  InsightHistory,
} from "./insight-types.js";

/**
 * The totals of every date from `fromDate` to `toDate`. A date without a
 * complete entry has no meals, and the panels count it as not recorded.
 */
export function buildInsightDays({
  fromDate,
  toDate,
  entries,
}: InsightHistory): InsightDay[] {
  const byDate = new Map<string, InsightEntry[]>();
  for (const entry of entries) {
    byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);
  }
  const days: InsightDay[] = [];
  for (let date = fromDate; date <= toDate; date = shiftDateKey(date, 1)) {
    const dayEntries = byDate.get(date) ?? [];
    days.push({
      date,
      calories: dayEntries.reduce((sum, entry) => sum + entry.calories, 0),
      proteinG: dayEntries.reduce((sum, entry) => sum + entry.proteinG, 0),
      mealCount: dayEntries.length,
      nutrients: aggregateNutrients(
        dayEntries.flatMap((entry) =>
          entry.items.map((item) => item.nutrients ?? {}),
        ),
      ),
    });
  }
  return days;
}
