import { shiftDateKey } from "@app/common/features/core/utils/logical-date";
import { normalizeFoodName } from "@app/common/features/entries/utils/insights/insight-shared";
import type {
  InsightEntry,
  InsightItem,
} from "@app/common/features/entries/utils/insights/insight-types";
import {
  nullableNutrientValue,
  type NutrientKey,
} from "@app/common/features/entries/utils/nutrients";

export type FoodSourceMetric = "calories" | "proteinG" | NutrientKey;

interface FoodSourceEntry {
  entryId: string;
  date: string;
  consumedAt: number;
  quantity: number | null;
  unit: string | null;
  /** `null` when the item has no value for the metric. */
  amount: number | null;
}

interface FoodSource {
  key: string;
  label: string;
  /** The known amount of all items of this food. */
  amount: number;
  /** The share of the known total of all foods, from 0 to 1. */
  share: number;
  entryCount: number;
  entries: FoodSourceEntry[];
}

export interface FoodSources {
  startDate: string;
  endDate: string;
  knownTotal: number;
  knownItemCount: number;
  totalItemCount: number;
  sources: FoodSource[];
}

const TOP_COUNT = 8;

function amountOf(item: InsightItem, metric: FoodSourceMetric): number | null {
  return nullableNutrientValue(
    metric === "calories" || metric === "proteinG"
      ? item[metric]
      : item.nutrients?.[metric],
  );
}

/**
 * The foods that supply most of one metric over the last `range` days that
 * end on `currentDate`. Foods group by name. An item without a value counts
 * as an unknown item, and never as zero.
 */
export function calculateFoodSources({
  entries,
  currentDate,
  range,
  metric,
}: {
  entries: readonly InsightEntry[];
  currentDate: string;
  range: 7 | 30;
  metric: FoodSourceMetric;
}): FoodSources {
  const startDate = shiftDateKey(currentDate, -(range - 1));
  const groups = new Map<string, Omit<FoodSource, "share">>();
  let knownTotal = 0;
  let knownItemCount = 0;
  let totalItemCount = 0;
  for (const entry of entries) {
    if (entry.date < startDate || entry.date > currentDate) {
      continue;
    }
    for (const item of entry.items) {
      const amount = amountOf(item, metric);
      totalItemCount += 1;
      if (amount !== null) {
        knownItemCount += 1;
        knownTotal += amount;
      }
      const key = normalizeFoodName(item.name);
      const group = groups.get(key) ?? {
        key,
        label: item.name.trim() || "Unnamed food",
        amount: 0,
        entryCount: 0,
        entries: [],
      };
      group.amount += amount ?? 0;
      group.entryCount += 1;
      group.entries.push({
        entryId: entry.id,
        date: entry.date,
        consumedAt: entry.consumedAt,
        quantity:
          typeof item.quantity === "number" && Number.isFinite(item.quantity)
            ? item.quantity
            : null,
        unit: item.unit?.trim() || null,
        amount,
      });
      groups.set(key, group);
    }
  }
  const sources = [...groups.values()]
    .filter((group) => group.amount > 0)
    .toSorted(
      (left, right) =>
        right.amount - left.amount || left.label.localeCompare(right.label),
    )
    .slice(0, TOP_COUNT)
    .map((group) => ({
      ...group,
      share: group.amount / knownTotal,
      entries: group.entries.toSorted(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.consumedAt - left.consumedAt,
      ),
    }));
  return {
    startDate,
    endDate: currentDate,
    knownTotal,
    knownItemCount,
    totalItemCount,
    sources,
  };
}
