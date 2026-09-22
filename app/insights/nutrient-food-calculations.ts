import {
  nutrientKeys,
  nutrientMeta,
  nutrientUnit,
  parseNutrientValue,
  type NutrientKey,
} from "../nutrition/nutrient-meta";
import type { InsightEntry, InsightItem } from "./types";

export type InsightRange = 14 | 28;
export type FoodScenarioMode = "addition" | "replacement";
export type FoodScenarioMultiplier = 0.5 | 1 | 1.5;
export type FoodScenarioMetricKey = "calories" | "proteinG" | NutrientKey;

export const foodScenarioMultipliers = [0.5, 1, 1.5] as const;
export const foodScenarioMetricKeys: readonly FoodScenarioMetricKey[] = ["calories", "proteinG", ...nutrientKeys];

export type FoodScenarioMetric = {
  key: FoodScenarioMetricKey;
  label: string;
  unit: string;
  before: number | null;
  after: number | null;
  delta: number | null;
};

export type FoodScenarioResult = {
  mode: FoodScenarioMode;
  multiplier: FoodScenarioMultiplier;
  beforeName: string | null;
  afterName: string;
  metrics: FoodScenarioMetric[];
  knownMetricCount: number;
  unknownMetricCount: number;
};

export type FoodScenarioTradeoff = {
  increases: FoodScenarioMetric[];
  decreases: FoodScenarioMetric[];
  unchanged: FoodScenarioMetric[];
  unknown: FoodScenarioMetric[];
};

export type FoodScenarioTradeoffTextOptions = {
  focusedNutrient?: NutrientKey | null;
  maxMetrics?: number;
};

export type FoodScenarioRequest =
  | {
      mode: "addition";
      item: InsightItem;
      multiplier?: FoodScenarioMultiplier;
    }
  | {
      mode: "replacement";
      before: InsightItem;
      after: InsightItem;
      multiplier?: FoodScenarioMultiplier;
    };

export type ScenarioFoodCandidate = {
  id: string;
  entryId: string;
  date: string;
  consumedAt: number;
  label: string;
  item: InsightItem;
};

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

export function normalizeFoodName(name: string) {
  return name.trim().toLowerCase();
}

function addDays(date: string, amount: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

export function insightDateRange(currentDate: string, range: InsightRange) {
  return {
    startDate: addDays(currentDate, -range),
    endDate: addDays(currentDate, -1),
    elapsedDays: range,
  } as const;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function itemMetric(item: InsightItem, key: FoodScenarioMetricKey): number | null {
  if (key === "calories" || key === "proteinG") return finiteNonNegative(item[key]);
  return parseNutrientValue(item.nutrients?.[key]);
}

export function foodScenarioMetricMeta(key: FoodScenarioMetricKey) {
  if (key === "calories") return { label: "Calories", unit: "kcal" };
  if (key === "proteinG") return { label: "Protein", unit: "g" };
  return { label: nutrientMeta(key).label, unit: nutrientUnit(key) };
}

function scaled(value: number | null, multiplier: FoodScenarioMultiplier) {
  return value === null ? null : value * multiplier;
}

/**
 * Compare one logged item with an addition or replacement. Unknown nutrient
 * values remain null, and are never treated as zero. The returned scenario is
 * ephemeral: this function only calculates values and does not mutate input.
 */
export function calculateFoodScenario(request: FoodScenarioRequest): FoodScenarioResult {
  const multiplier = request.multiplier ?? 1;
  const beforeItem = request.mode === "replacement" ? request.before : null;
  const afterItem = request.mode === "replacement" ? request.after : request.item;
  const metrics = foodScenarioMetricKeys.map((key): FoodScenarioMetric => {
    const before = beforeItem ? itemMetric(beforeItem, key) : 0;
    const after = scaled(itemMetric(afterItem, key), multiplier);
    return {
      key,
      ...foodScenarioMetricMeta(key),
      before,
      after,
      delta: before !== null && after !== null ? after - before : null,
    };
  });
  return {
    mode: request.mode,
    multiplier,
    beforeName: beforeItem?.name.trim() || null,
    afterName: afterItem.name.trim() || "Unnamed item",
    metrics,
    knownMetricCount: metrics.filter((metric) => metric.delta !== null).length,
    unknownMetricCount: metrics.filter((metric) => metric.delta === null).length,
  };
}

function formatTradeoffAmount(metric: FoodScenarioMetric, value: number) {
  const digits = metric.key === "calories" ? 0 : metric.key === "proteinG" ? 1 : nutrientMeta(metric.key).precision;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value)} ${metric.unit}`;
}

function joinTradeoffParts(parts: readonly string[]) {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

/** Categorize the calculated delta without assigning a health score. */
export function foodScenarioTradeoffs(result: FoodScenarioResult): FoodScenarioTradeoff {
  return {
    increases: result.metrics.filter((metric) => metric.delta !== null && metric.delta > 0),
    decreases: result.metrics.filter((metric) => metric.delta !== null && metric.delta < 0),
    unchanged: result.metrics.filter((metric) => metric.delta === 0),
    unknown: result.metrics.filter((metric) => metric.delta === null),
  };
}

/** Generate a concise user-facing explanation directly from known scenario deltas. */
export function foodScenarioTradeoffText(result: FoodScenarioResult, options: FoodScenarioTradeoffTextOptions = {}) {
  const tradeoffs = foodScenarioTradeoffs(result);
  const maxMetrics = Number.isFinite(options.maxMetrics) ? Math.max(1, Math.floor(options.maxMetrics as number)) : 4;
  const preferredKeys = [
    options.focusedNutrient ?? null,
    "calories",
    "sodiumMg",
    "saturatedFatG",
    "fiberG",
    "proteinG",
  ].filter((key, index, keys): key is FoodScenarioMetricKey => key !== null && keys.indexOf(key) === index);
  const priority = new Map<FoodScenarioMetricKey, number>(preferredKeys.map((key, index) => [key, index]));
  const changed = [...tradeoffs.increases, ...tradeoffs.decreases];
  const selected = [...changed]
    .sort((left, right) => (priority.get(left.key) ?? preferredKeys.length) - (priority.get(right.key) ?? preferredKeys.length) || foodScenarioMetricKeys.indexOf(left.key) - foodScenarioMetricKeys.indexOf(right.key))
    .slice(0, maxMetrics);
  const selectedKeys = new Set(selected.map((metric) => metric.key));
  const additionalChangedCount = changed.filter((metric) => !selectedKeys.has(metric.key)).length;
  const selectedTradeoffs: FoodScenarioTradeoff = {
    increases: selected.filter((metric) => metric.delta !== null && metric.delta > 0),
    decreases: selected.filter((metric) => metric.delta !== null && metric.delta < 0),
    unchanged: [],
    unknown: tradeoffs.unknown,
  };
  const clauses: string[] = [];
  if (selectedTradeoffs.increases.length) {
    clauses.push(`increases ${joinTradeoffParts(selectedTradeoffs.increases.map((metric) => `${metric.label} by ${formatTradeoffAmount(metric, metric.delta as number)}`))}`);
  }
  if (selectedTradeoffs.decreases.length) {
    clauses.push(`decreases ${joinTradeoffParts(selectedTradeoffs.decreases.map((metric) => `${metric.label} by ${formatTradeoffAmount(metric, Math.abs(metric.delta as number))}`))}`);
  }
  if (!clauses.length) clauses.push("does not change any known tracked values");
  let sentence = `This change ${joinTradeoffParts(clauses)}.`;
  if (additionalChangedCount) {
    sentence += ` ${additionalChangedCount} other tracked value${additionalChangedCount === 1 ? " changes" : "s change"} in the table.`;
  }
  if (tradeoffs.unknown.length) {
    const count = tradeoffs.unknown.length;
    sentence += ` ${count} tracked value${count === 1 ? " remains" : "s remain"} unknown.`;
  }
  return sentence;
}

/** List individual logged portions that can be selected for a scenario. */
export function scenarioFoodCandidates({
  entries,
  currentDate,
  range,
  prioritizeNutrient,
}: {
  entries: readonly InsightEntry[];
  currentDate: string;
  range: InsightRange;
  prioritizeNutrient?: NutrientKey;
}): ScenarioFoodCandidate[] {
  const { startDate, endDate } = insightDateRange(currentDate, range);
  const candidates = entries
    .filter((entry) => entry.date >= startDate && entry.date <= endDate)
    .flatMap((entry) => entry.items.map((item, index) => ({
      id: `${entry.id}:${index}`,
      entryId: entry.id,
      date: entry.date,
      consumedAt: entry.consumedAt,
      label: item.name.trim() || "Unnamed item",
      item,
    })));
  return candidates.sort((left, right) => {
    if (prioritizeNutrient) {
      const leftAmount = itemMetric(left.item, prioritizeNutrient);
      const rightAmount = itemMetric(right.item, prioritizeNutrient);
      const leftKnown = leftAmount !== null;
      const rightKnown = rightAmount !== null;
      if (leftKnown !== rightKnown) return Number(rightKnown) - Number(leftKnown);
      if (leftAmount !== null && rightAmount !== null && leftAmount !== rightAmount) return rightAmount - leftAmount;
    }
    return right.date.localeCompare(left.date) || right.consumedAt - left.consumedAt || left.id.localeCompare(right.id);
  });
}

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
  return parseNutrientValue(item.nutrients?.[nutrientKey]);
}

function sourceKeyForItem(item: InsightItem) {
  const normalized = normalizeFoodName(item.name);
  return normalized || "__unnamed__";
}

function sourceLabelForItem(item: InsightItem) {
  return item.name.trim() || "Unnamed item";
}

function sourceEntryDetails(entries: readonly SourceEntry[]) {
  const dates = [...new Set(entries.map((entry) => entry.date))].sort();
  return {
    entryCount: entries.length,
    dayCount: dates.length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  };
}

function sourceSnapshot(source: MutableSource, knownTotal: number | null): NutrientSource {
  const amount = source.knownItemCount > 0 ? source.amount : null;
  const entries = [...source.entries].sort((left, right) => right.date.localeCompare(left.date) || right.consumedAt - left.consumedAt || left.entryId.localeCompare(right.entryId));
  const details = sourceEntryDetails(entries);
  return {
    key: source.key,
    label: source.label,
    amount,
    share: amount !== null && knownTotal !== null && knownTotal > 0 ? amount / knownTotal : null,
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
  const { startDate, endDate, elapsedDays } = insightDateRange(currentDate, range);
  const grouped = new Map<string, MutableSource>();
  let knownItemCount = 0;
  let totalItemCount = 0;
  let unknownItemCount = 0;
  let knownTotal = 0;
  const recordedEntryIds = new Set<string>();
  const recordedDates = new Set<string>();
  const knownDates = new Set<string>();

  for (const entry of entries) {
    if (entry.date < startDate || entry.date > endDate) continue;
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
        quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : null,
        unit: typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : null,
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
    .sort((left, right) => (right.amount ?? -1) - (left.amount ?? -1) || right.knownItemCount - left.knownItemCount || left.label.localeCompare(right.label));
  const limit = Number.isFinite(topLimit) ? Math.max(1, Math.floor(topLimit)) : 5;
  const sources = allSources.slice(0, limit);
  const remainder = allSources.slice(limit);
  const otherKnownCount = remainder.reduce((sum, source) => sum + source.knownItemCount, 0);
  const otherTotalCount = remainder.reduce((sum, source) => sum + source.totalItemCount, 0);
  const otherUnknownCount = remainder.reduce((sum, source) => sum + source.unknownItemCount, 0);
  const otherAmount = remainder.some((source) => source.amount !== null)
    ? remainder.reduce((sum, source) => sum + (source.amount ?? 0), 0)
    : null;
  const other = remainder.length
    ? {
        key: OTHER_SOURCE_KEY,
        label: "Other recorded sources",
        amount: otherAmount,
        share: otherAmount !== null && total !== null && total > 0 ? otherAmount / total : null,
        knownItemCount: otherKnownCount,
        totalItemCount: otherTotalCount,
        unknownItemCount: otherUnknownCount,
        ...sourceEntryDetails(remainder.flatMap((source) => source.entries)),
        entries: remainder.flatMap((source) => source.entries).sort((left, right) => right.date.localeCompare(left.date) || right.consumedAt - left.consumedAt || left.entryId.localeCompare(right.entryId)),
      }
    : null;

  const sourceShares = allSources.map((source) => source.share).filter((share): share is number => share !== null);

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
    topThreeSourceShare: sourceShares.length ? sourceShares.slice(0, 3).reduce((sum, share) => sum + share, 0) : null,
    sources,
    other,
    allSources,
  };
}

export function calculateSourceDependence(args: Parameters<typeof calculateNutrientSourceDependence>[0]) {
  return calculateNutrientSourceDependence(args);
}

/** Calculate a reversible what-if removal from recorded values only. */
export function calculateNutrientSourceExclusion(
  result: NutrientSourceDependenceResult,
  sourceKey: string,
): NutrientSourceExclusion | null {
  const source = sourceKey === OTHER_SOURCE_KEY
    ? result.other
    : result.allSources.find((candidate) => candidate.key === sourceKey) ?? null;
  if (!source) return null;
  const excludedKnownAmount = source.amount;
  const remainingKnownAmount = result.knownTotal === null || excludedKnownAmount === null
    ? result.knownTotal
    : Math.max(0, result.knownTotal - excludedKnownAmount);
  return {
    sourceKey: source.key,
    sourceLabel: source.label,
    excludedKnownAmount,
    remainingKnownAmount,
    excludedUnknownItemCount: source.unknownItemCount,
    remainingUnknownItemCount: Math.max(0, result.unknownItemCount - source.unknownItemCount),
  };
}

export const calculateFoodChangeScenario = calculateFoodScenario;
export const listScenarioFoodCandidates = scenarioFoodCandidates;
export const calculateSourceExclusion = calculateNutrientSourceExclusion;
export { OTHER_SOURCE_KEY };
