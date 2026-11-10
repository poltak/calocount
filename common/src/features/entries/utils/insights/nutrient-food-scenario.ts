import { shiftDateKey } from "../../../core/utils/logical-date.js";
import {
  NUTRIENT_KEYS,
  NUTRIENT_META,
  nullableNutrientValue,
  type NutrientKey,
} from "../nutrients.js";
import type { InsightEntry, InsightItem } from "./insight-types.js";

const metaByKey = new Map<string, (typeof NUTRIENT_META)[number]>(
  NUTRIENT_META.map((meta) => [meta.key, meta]),
);

export type InsightRange = 14 | 28;
export type FoodScenarioMode = "addition" | "replacement";
export type FoodScenarioMultiplier = 0.5 | 1 | 1.5;
export type FoodScenarioMetricKey = "calories" | "proteinG" | NutrientKey;

export const foodScenarioMultipliers = [0.5, 1, 1.5] as const;
export const foodScenarioMetricKeys: readonly FoodScenarioMetricKey[] = [
  "calories",
  "proteinG",
  ...NUTRIENT_KEYS,
];

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
export function insightDateRange(currentDate: string, range: InsightRange) {
  return {
    startDate: shiftDateKey(currentDate, -range),
    endDate: shiftDateKey(currentDate, -1),
    elapsedDays: range,
  } as const;
}

function itemMetric(
  item: InsightItem,
  key: FoodScenarioMetricKey,
): number | null {
  if (key === "calories" || key === "proteinG") {
    return nullableNutrientValue(item[key]);
  }
  return nullableNutrientValue(item.nutrients?.[key]);
}

export function foodScenarioMetricMeta(key: FoodScenarioMetricKey) {
  if (key === "calories") {
    return { label: "Calories", unit: "kcal" };
  }
  if (key === "proteinG") {
    return { label: "Protein", unit: "g" };
  }
  const meta = metaByKey.get(key);
  return { label: meta?.label ?? key, unit: meta?.unit ?? "g" };
}

function scaled(value: number | null, multiplier: FoodScenarioMultiplier) {
  return value === null ? null : value * multiplier;
}

/**
 * Compare one logged item with an addition or replacement. Unknown nutrient
 * values remain null, and are never treated as zero. The returned scenario is
 * ephemeral: this function only calculates values and does not mutate input.
 */
export function calculateFoodScenario(
  request: FoodScenarioRequest,
): FoodScenarioResult {
  const multiplier = request.multiplier ?? 1;
  const beforeItem = request.mode === "replacement" ? request.before : null;
  const afterItem =
    request.mode === "replacement" ? request.after : request.item;
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
    unknownMetricCount: metrics.filter((metric) => metric.delta === null)
      .length,
  };
}

function formatTradeoffAmount(metric: FoodScenarioMetric, value: number) {
  const digits =
    metric.key === "calories"
      ? 0
      : metric.key === "proteinG"
        ? 1
        : (metaByKey.get(metric.key)?.precision ?? 1);
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value)} ${metric.unit}`;
}

function joinTradeoffParts(parts: readonly string[]) {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

/** Categorize the calculated delta without assigning a health score. */
export function foodScenarioTradeoffs(
  result: FoodScenarioResult,
): FoodScenarioTradeoff {
  return {
    increases: result.metrics.filter(
      (metric) => metric.delta !== null && metric.delta > 0,
    ),
    decreases: result.metrics.filter(
      (metric) => metric.delta !== null && metric.delta < 0,
    ),
    unchanged: result.metrics.filter((metric) => metric.delta === 0),
    unknown: result.metrics.filter((metric) => metric.delta === null),
  };
}

/** Generate a concise user-facing explanation directly from known scenario deltas. */
export function foodScenarioTradeoffText(
  result: FoodScenarioResult,
  options: FoodScenarioTradeoffTextOptions = {},
) {
  const tradeoffs = foodScenarioTradeoffs(result);
  const maxMetrics = Number.isFinite(options.maxMetrics)
    ? Math.max(1, Math.floor(options.maxMetrics as number))
    : 4;
  const preferredKeys = [
    options.focusedNutrient ?? null,
    "calories",
    "sodiumMg",
    "saturatedFatG",
    "fiberG",
    "proteinG",
  ].filter(
    (key, index, keys): key is FoodScenarioMetricKey =>
      key !== null && keys.indexOf(key) === index,
  );
  const priority = new Map<FoodScenarioMetricKey, number>(
    preferredKeys.map((key, index) => [key, index]),
  );
  const changed = [...tradeoffs.increases, ...tradeoffs.decreases];
  const selected = [...changed]
    .toSorted(
      (left, right) =>
        (priority.get(left.key) ?? preferredKeys.length) -
          (priority.get(right.key) ?? preferredKeys.length) ||
        foodScenarioMetricKeys.indexOf(left.key) -
          foodScenarioMetricKeys.indexOf(right.key),
    )
    .slice(0, maxMetrics);
  const selectedKeys = new Set(selected.map((metric) => metric.key));
  const additionalChangedCount = changed.filter(
    (metric) => !selectedKeys.has(metric.key),
  ).length;
  const selectedTradeoffs: FoodScenarioTradeoff = {
    increases: selected.filter(
      (metric) => metric.delta !== null && metric.delta > 0,
    ),
    decreases: selected.filter(
      (metric) => metric.delta !== null && metric.delta < 0,
    ),
    unchanged: [],
    unknown: tradeoffs.unknown,
  };
  const clauses: string[] = [];
  if (selectedTradeoffs.increases.length) {
    clauses.push(
      `increases ${joinTradeoffParts(selectedTradeoffs.increases.map((metric) => `${metric.label} by ${formatTradeoffAmount(metric, metric.delta as number)}`))}`,
    );
  }
  if (selectedTradeoffs.decreases.length) {
    clauses.push(
      `decreases ${joinTradeoffParts(selectedTradeoffs.decreases.map((metric) => `${metric.label} by ${formatTradeoffAmount(metric, Math.abs(metric.delta as number))}`))}`,
    );
  }
  if (!clauses.length) {
    clauses.push("does not change any known tracked values");
  }
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
    .flatMap((entry) =>
      entry.items.map((item, index) => ({
        id: `${entry.id}:${index}`,
        entryId: entry.id,
        date: entry.date,
        consumedAt: entry.consumedAt,
        label: item.name.trim() || "Unnamed item",
        item,
      })),
    );
  return candidates.toSorted((left, right) => {
    if (prioritizeNutrient) {
      const leftAmount = itemMetric(left.item, prioritizeNutrient);
      const rightAmount = itemMetric(right.item, prioritizeNutrient);
      const leftKnown = leftAmount !== null;
      const rightKnown = rightAmount !== null;
      if (leftKnown !== rightKnown) {
        return Number(rightKnown) - Number(leftKnown);
      }
      if (
        leftAmount !== null &&
        rightAmount !== null &&
        leftAmount !== rightAmount
      ) {
        return rightAmount - leftAmount;
      }
    }
    return (
      right.date.localeCompare(left.date) ||
      right.consumedAt - left.consumedAt ||
      left.id.localeCompare(right.id)
    );
  });
}
