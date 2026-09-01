import {
  NUTRIENT_KEYS,
  NUTRIENT_META,
  type NutrientAggregate as SharedNutrientAggregate,
  type NutrientKey as SharedNutrientKey,
} from "../../domain/nutrients";
import {
  NUTRIENT_GOAL_DEFINITIONS,
  resolveNutrientGoals,
  type NutrientGoalMap as SharedNutrientGoalMap,
  type ResolvedNutrientGoal,
} from "../../domain/nutrient-goals";

export type NutrientValue = number | null | undefined;
export type NutrientKey = SharedNutrientKey;

export type NutrientAggregate = SharedNutrientAggregate;
export type NutrientGoal = ResolvedNutrientGoal;
export type NutrientGoalMap = SharedNutrientGoalMap;

export type NutrientAggregateMap = Partial<Record<string, NutrientAggregate>>;
export type NutrientValueMap = Partial<Record<string, NutrientValue>>;

export type NutrientMeta = {
  key: string;
  label: string;
  group: string;
  unit: string;
  precision: number;
  order: number;
};

type SharedMeta = (typeof NUTRIENT_META)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function firstFinite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function titleFromKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());
}

function normaliseGroup(value: unknown) {
  const group = firstString(value, "other").toLowerCase();
  if (group.includes("carb")) return "carbohydrates";
  if (group.includes("fat") || group.includes("lipid")) return "fats";
  if (group.includes("vitamin")) return "vitamins";
  if (group.includes("mineral")) return "minerals";
  return group;
}

const metadataSource = Object.fromEntries(NUTRIENT_META.map((entry) => [entry.key, entry])) as Record<string, SharedMeta>;

/** Ordered keys from the shared domain catalogue. */
export const nutrientKeys = [...NUTRIENT_KEYS]
  .map((key, index) => ({ key, order: index }))
  .sort((left, right) => left.order - right.order)
  .map(({ key }) => key);

export const nutrientGroupOrder = ["carbohydrates", "fats", "vitamins", "minerals", "other"];
export const defaultNutrientGoals = resolveNutrientGoals();

export function nutrientMeta(key: string): NutrientMeta {
  const source = metadataSource[key];
  const group = normaliseGroup(source?.group);
  return {
    key,
    label: firstString(source?.label, titleFromKey(key)),
    group,
    unit: firstString(source?.unit, key.endsWith("Mg") ? "mg" : key.endsWith("Mcg") ? "mcg" : "g"),
    precision: Math.max(0, firstFinite(source?.precision, 1)),
    order: nutrientKeys.indexOf(key as NutrientKey),
  };
}

export function nutrientLabel(key: string) {
  return nutrientMeta(key).label;
}

export function nutrientUnit(key: string) {
  return nutrientMeta(key).unit;
}

export function nutrientGroup(key: string) {
  return nutrientMeta(key).group;
}

export function groupedNutrientKeys(keys: readonly NutrientKey[] = nutrientKeys) {
  const groups = new Map<string, NutrientKey[]>();
  for (const key of [...keys].sort((left, right) => nutrientMeta(left).order - nutrientMeta(right).order)) {
    const group = nutrientGroup(key);
    const current = groups.get(group) ?? [];
    current.push(key);
    groups.set(group, current);
  }
  return nutrientGroupOrder
    .filter((group) => groups.has(group))
    .map((group) => ({ group, keys: groups.get(group) as NutrientKey[] }));
}

export function nutrientGroupLabel(group: string) {
  switch (group) {
    case "carbohydrates": return "Carbohydrates";
    case "fats": return "Fats and lipids";
    case "vitamins": return "Vitamins";
    case "minerals": return "Minerals";
    default: return "Other";
  }
}

export function formatNutrientAmount(value: NutrientValue, key: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: nutrientMeta(key).precision,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatNutrientValue(value: NutrientValue, key: string) {
  const amount = formatNutrientAmount(value, key);
  return amount === "—" ? amount : `${amount} ${nutrientUnit(key)}`;
}

export function parseNutrientValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseNutrientAggregate(value: unknown): NutrientAggregate | null {
  if (!isRecord(value)) return null;
  const parsedAmount = value.amount === null ? null : parseNutrientValue(value.amount);
  const amount = parsedAmount === undefined ? null : parsedAmount;
  const knownItemCount = firstFinite(value.knownItemCount, 0);
  const totalItemCount = firstFinite(value.totalItemCount, 0);
  return {
    amount,
    knownItemCount,
    totalItemCount,
    complete: value.complete === true && amount !== null,
  };
}

export function parseNutrientAggregateMap(value: unknown): NutrientAggregateMap {
  if (!isRecord(value)) return {};
  const result: NutrientAggregateMap = {};
  for (const key of nutrientKeys) {
    const aggregate = parseNutrientAggregate(value[key]);
    if (aggregate) result[key] = aggregate;
  }
  return result;
}

export function parseNutrientGoalMap(value: unknown): NutrientGoalMap {
  if (!isRecord(value)) return defaultNutrientGoals;
  const goals = {} as NutrientGoalMap;
  for (const key of nutrientKeys) {
    const definition = NUTRIENT_GOAL_DEFINITIONS[key];
    const entry = asGoalRecord(value[key]);
    const amount = entry?.value === null ? null : parseNutrientValue(entry?.value);
    goals[key] = {
      value: amount && amount > 0 ? amount : null,
      direction: entry?.direction === "minimum" || entry?.direction === "maximum"
        ? entry.direction
        : definition.direction,
      source: entry?.source === "custom" || entry?.source === "disabled" ? entry.source : "default",
    };
  }
  return goals;
}

function asGoalRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function nutrientGoalProgress(amount: NutrientValue, goal: NutrientGoal | null | undefined) {
  const parsedAmount = parseNutrientValue(amount);
  if (parsedAmount === null || !goal || goal.value === null || goal.value <= 0) return null;
  const rawPercent = (parsedAmount / goal.value) * 100;
  return {
    rawPercent,
    displayPercent: Math.round(rawPercent),
    fillPercent: Math.min(100, Math.max(0, rawPercent)),
    status: goal.direction === "minimum"
      ? rawPercent >= 100 ? "complete" : "progress"
      : rawPercent > 100 ? "exceeded" : rawPercent >= 75 ? "warning" : "within",
  } as const;
}

export function aggregateNutrientValues(items: readonly NutrientValueMap[]): NutrientAggregateMap {
  const keys = new Set<string>(nutrientKeys);
  for (const item of items) Object.keys(item).forEach((key) => keys.add(key));
  const result: NutrientAggregateMap = {};
  for (const key of keys) {
    let amount = 0;
    let knownItemCount = 0;
    for (const item of items) {
      const value = parseNutrientValue(item[key]);
      if (value === null) continue;
      amount += value;
      knownItemCount += 1;
    }
    const totalItemCount = items.length;
    result[key] = {
      amount: knownItemCount > 0 ? amount : null,
      knownItemCount,
      totalItemCount,
      complete: totalItemCount > 0 && knownItemCount === totalItemCount,
    };
  }
  return result;
}

export function aggregateForValue(value: NutrientValue, totalItemCount = 1): NutrientAggregate {
  const parsed = parseNutrientValue(value);
  return {
    amount: parsed === undefined ? null : parsed,
    knownItemCount: parsed === null ? 0 : 1,
    totalItemCount,
    complete: parsed !== null && totalItemCount <= 1,
  };
}

export function aggregateCoverageLabel(aggregate: NutrientAggregate | null | undefined) {
  if (!aggregate || aggregate.amount === null) return "Unknown";
  if (aggregate.complete) return "Complete";
  return `Partial · ${aggregate.knownItemCount} of ${aggregate.totalItemCount} items`;
}
