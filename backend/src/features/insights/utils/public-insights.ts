import type { InsightItem } from "@app/common/features/entries/utils/insights/insight-types";
import type { readInsights } from "../handlers/insights-read.js";

type InsightsRead = Awaited<ReturnType<typeof readInsights>>;

type PublicInsightItem = Omit<InsightItem, "nutrientProvenance">;

/**
 * The items lose where each amount came from. The reference settings are
 * the owner's choice for the owner's panels, so a visitor gets none.
 */
export function publicInsightsOf(read: InsightsRead) {
  return {
    timezone: read.timezone,
    fromDate: read.fromDate,
    toDate: read.toDate,
    entries: read.entries.map((entry) => ({
      id: entry.id,
      date: entry.date,
      consumedAt: entry.consumedAt,
      calories: entry.calories,
      proteinG: entry.proteinG,
      items: entry.items.map((item): PublicInsightItem => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        proteinG: item.proteinG,
        nutrients: item.nutrients,
      })),
    })),
    calorieTarget: read.calorieTarget,
    nutrientGoals: read.nutrientGoals,
    proteinTargets: read.proteinTargets,
    referenceSettings: {
      vitaminB6UsFnbAdultUlEnabled: false as const,
      usFnbAdultUlEnabled: false as const,
    },
  };
}
