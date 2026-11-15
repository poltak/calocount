import { nullableNutrientValue, type NutrientKey } from "../nutrients.js";
import type { InsightEntry, InsightItem } from "./insight-types.js";
import { normalizeFoodName } from "./insight-shared.js";
import {
  insightDateRange,
  type InsightRange,
} from "./nutrient-food-scenario.js";

export type SourceEntry = {
  entryId: string;
  date: string;
  consumedAt: number;
  itemName: string;
  quantity: number | null;
  unit: string | null;
  value: number | null;
};

export type NutrientSource = {
  key: string;
  label: string;
  amount: number | null;
  share: number | null;
  knownItemCount: number;
  totalItemCount: number;
  unknownItemCount: number;
  entryCount: number;
  dayCount: number;
  firstDate: string | null;
  lastDate: string | null;
  entries: SourceEntry[];
};

export type NutrientSourceDependenceResult = {
  startDate: string;
  endDate: string;
  elapsedDays: InsightRange;
  nutrientKey: NutrientKey;
  knownTotal: number | null;
  knownItemCount: number;
  totalItemCount: number;
  unknownItemCount: number;
  recordedEntryCount: number;
  recordedDayCount: number;
  knownDayCount: number;
  sourceCount: number;
  largestSourceShare: number | null;
  topThreeSourceShare: number | null;
  sources: NutrientSource[];
  other: NutrientSource | null;
  allSources: NutrientSource[];
};

export type NutrientSourceExclusion = {
  sourceKey: string;
  sourceLabel: string;
  excludedKnownAmount: number | null;
  remainingKnownAmount: number | null;
  excludedUnknownItemCount: number;
  remainingUnknownItemCount: number;
};

const OTHER_SOURCE_KEY = "__other__";

type MutableSource = {
  key: string;
  label: string;
  amount: number;
  knownItemCount: number;
  totalItemCount: number;
  unknownItemCount: number;
  entries: SourceEntry[];
};

function sourceEntryValue(item: InsightItem, nutrientKey: NutrientKey) {
  return nullableNutrientValue(item.nutrients?.[nutrientKey]);
}

function sourceKeyForItem(item: InsightItem) {
  const normalized = normalizeFoodName(item.name);
  return normalized || "__unnamed__";
}

function sourceLabelForItem(item: InsightItem) {
  return item.name.trim() || "Unnamed item";
}

function sourceEntryDetails(entries: readonly SourceEntry[]) {
  const dates = [...new Set(entries.map((entry) => entry.date))].toSorted();
  return {
    entryCount: entries.length,
    dayCount: dates.length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  };
}

function sourceSnapshot(
  source: MutableSource,
  knownTotal: number | null,
): NutrientSource {
  const amount = source.knownItemCount > 0 ? source.amount : null;
  const entries = [...source.entries].toSorted(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      right.consumedAt - left.consumedAt ||
      left.entryId.localeCompare(right.entryId),
  );
  const details = sourceEntryDetails(entries);
  return {
    key: source.key,
    label: source.label,
    amount,
    share:
      amount !== null && knownTotal !== null && knownTotal > 0
        ? amount / knownTotal
        : null,
    knownItemCount: source.knownItemCount,
    totalItemCount: source.totalItemCount,
    unknownItemCount: source.unknownItemCount,
    ...details,
    entries,
  };
}

/**
 * Aggregate a nutrient by exact normalized item name for finished dates in a
 * 14- or 28-day window. Shares refer only to recorded known amounts.
 */
export function calculateNutrientSourceDependence({
  entries,
  currentDate,
  range,
  nutrientKey,
  topLimit = 5,
}: {
  entries: readonly InsightEntry[];
  currentDate: string;
  range: InsightRange;
  nutrientKey: NutrientKey;
  topLimit?: number;
}): NutrientSourceDependenceResult {
  const { startDate, endDate, elapsedDays } = insightDateRange(
    currentDate,
    range,
  );
  const grouped = new Map<string, MutableSource>();
  let knownItemCount = 0;
  let totalItemCount = 0;
  let unknownItemCount = 0;
  let knownTotal = 0;
  const recordedEntryIds = new Set<string>();
  const recordedDates = new Set<string>();
  const knownDates = new Set<string>();

  for (const entry of entries) {
    if (entry.date < startDate || entry.date > endDate) {
      continue;
    }
    for (const item of entry.items) {
      const key = sourceKeyForItem(item);
      const current = grouped.get(key) ?? {
        key,
        label: sourceLabelForItem(item),
        amount: 0,
        knownItemCount: 0,
        totalItemCount: 0,
        unknownItemCount: 0,
        entries: [],
      };
      const value = sourceEntryValue(item, nutrientKey);
      current.totalItemCount += 1;
      totalItemCount += 1;
      current.entries.push({
        entryId: entry.id,
        date: entry.date,
        consumedAt: entry.consumedAt,
        itemName: sourceLabelForItem(item),
        quantity:
          typeof item.quantity === "number" && Number.isFinite(item.quantity)
            ? item.quantity
            : null,
        unit:
          typeof item.unit === "string" && item.unit.trim()
            ? item.unit.trim()
            : null,
        value,
      });
      recordedEntryIds.add(entry.id);
      recordedDates.add(entry.date);
      if (value === null) {
        current.unknownItemCount += 1;
        unknownItemCount += 1;
      } else {
        current.amount += value;
        current.knownItemCount += 1;
        knownItemCount += 1;
        knownTotal += value;
        knownDates.add(entry.date);
      }
      grouped.set(key, current);
    }
  }

  const total = knownItemCount > 0 ? knownTotal : null;
  const allSources = [...grouped.values()]
    .map((source) => sourceSnapshot(source, total))
    .toSorted(
      (left, right) =>
        (right.amount ?? -1) - (left.amount ?? -1) ||
        right.knownItemCount - left.knownItemCount ||
        left.label.localeCompare(right.label),
    );
  const limit = Number.isFinite(topLimit)
    ? Math.max(1, Math.floor(topLimit))
    : 5;
  const sources = allSources.slice(0, limit);
  const remainder = allSources.slice(limit);
  const otherKnownCount = remainder.reduce(
    (sum, source) => sum + source.knownItemCount,
    0,
  );
  const otherTotalCount = remainder.reduce(
    (sum, source) => sum + source.totalItemCount,
    0,
  );
  const otherUnknownCount = remainder.reduce(
    (sum, source) => sum + source.unknownItemCount,
    0,
  );
  const otherAmount = remainder.some((source) => source.amount !== null)
    ? remainder.reduce((sum, source) => sum + (source.amount ?? 0), 0)
    : null;
  const other = remainder.length
    ? {
        key: OTHER_SOURCE_KEY,
        label: "Other recorded sources",
        amount: otherAmount,
        share:
          otherAmount !== null && total !== null && total > 0
            ? otherAmount / total
            : null,
        knownItemCount: otherKnownCount,
        totalItemCount: otherTotalCount,
        unknownItemCount: otherUnknownCount,
        ...sourceEntryDetails(remainder.flatMap((source) => source.entries)),
        entries: remainder
          .flatMap((source) => source.entries)
          .toSorted(
            (left, right) =>
              right.date.localeCompare(left.date) ||
              right.consumedAt - left.consumedAt ||
              left.entryId.localeCompare(right.entryId),
          ),
      }
    : null;

  const sourceShares = allSources
    .map((source) => source.share)
    .filter((share): share is number => share !== null);

  return {
    startDate,
    endDate,
    elapsedDays,
    nutrientKey,
    knownTotal: total,
    knownItemCount,
    totalItemCount,
    unknownItemCount,
    recordedEntryCount: recordedEntryIds.size,
    recordedDayCount: recordedDates.size,
    knownDayCount: knownDates.size,
    sourceCount: allSources.length,
    largestSourceShare: sourceShares[0] ?? null,
    topThreeSourceShare: sourceShares.length
      ? sourceShares.slice(0, 3).reduce((sum, share) => sum + share, 0)
      : null,
    sources,
    other,
    allSources,
  };
}

/** Calculate a reversible what-if removal from recorded values only. */
export function calculateNutrientSourceExclusion(
  result: NutrientSourceDependenceResult,
  sourceKey: string,
): NutrientSourceExclusion | null {
  const source =
    sourceKey === OTHER_SOURCE_KEY
      ? result.other
      : (result.allSources.find((candidate) => candidate.key === sourceKey) ??
        null);
  if (!source) {
    return null;
  }
  const excludedKnownAmount = source.amount;
  const remainingKnownAmount =
    result.knownTotal === null || excludedKnownAmount === null
      ? result.knownTotal
      : Math.max(0, result.knownTotal - excludedKnownAmount);
  return {
    sourceKey: source.key,
    sourceLabel: source.label,
    excludedKnownAmount,
    remainingKnownAmount,
    excludedUnknownItemCount: source.unknownItemCount,
    remainingUnknownItemCount: Math.max(
      0,
      result.unknownItemCount - source.unknownItemCount,
    ),
  };
}

export { OTHER_SOURCE_KEY };
