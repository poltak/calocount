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
import { nutrientGoalKind, type NutrientGoalKind } from "../../domain/nutrient-references";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstFinite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function titleFromKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());
}

/** Ordered keys from the shared domain catalogue. */
export const nutrientKeys: NutrientKey[] = [...NUTRIENT_KEYS];

const catalogueMeta = new Map<string, NutrientMeta>(NUTRIENT_META.map((entry) => [entry.key, {
  key: entry.key,
  label: entry.label,
  group: entry.group,
  unit: entry.unit,
  precision: entry.precision,
  order: nutrientKeys.indexOf(entry.key),
}]));

export const nutrientGroupOrder = ["carbohydrates", "fats", "vitamins", "minerals", "other"];
export const defaultNutrientGoals = resolveNutrientGoals();

export function nutrientMeta(key: string): NutrientMeta {
  // Keys outside the catalogue, such as source-form amounts, get a derived label and unit.
  return catalogueMeta.get(key) ?? {
    key,
    label: titleFromKey(key),
    group: "other",
    unit: key.endsWith("Mg") ? "mg" : key.endsWith("Mcg") ? "mcg" : "g",
    precision: 1,
    order: -1,
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

const amountFormatters = new Map<number, Intl.NumberFormat>();

export function formatNutrientAmount(value: NutrientValue, key: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const precision = nutrientMeta(key).precision;
  let formatter = amountFormatters.get(precision);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: precision, minimumFractionDigits: 0 });
    amountFormatters.set(precision, formatter);
  }
  return formatter.format(value);
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
  const amount = parseNutrientValue(value.amount);
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

/** The kind of a goal for display. Keys outside the catalogue have none. */
export function goalKindFor(key: string, goal: NutrientGoal | null | undefined): NutrientGoalKind | null {
  return catalogueMeta.has(key) ? nutrientGoalKind(key as NutrientKey, goal) : null;
}

/** The word for a goal of the given kind, as in "62% of limit". */
export function goalKindWord(kind: NutrientGoalKind | null): string {
  return kind === "limit" ? "limit" : kind === "reference" ? "reference" : "goal";
}

/**
 * Progress toward a goal. A maximum is judged as a limit unless `kind` says it
 * is only a reference amount, which gets a neutral status at any level.
 */
export function nutrientGoalProgress(amount: NutrientValue, goal: NutrientGoal | null | undefined, kind?: NutrientGoalKind | null) {
  const parsedAmount = parseNutrientValue(amount);
  if (parsedAmount === null || !goal || goal.value === null || goal.value <= 0) return null;
  const rawPercent = (parsedAmount / goal.value) * 100;
  return {
    rawPercent,
    displayPercent: Math.round(rawPercent),
    fillPercent: Math.min(100, Math.max(0, rawPercent)),
    status: goal.direction === "minimum"
      ? rawPercent >= 100 ? "complete" : "progress"
      : kind === "reference" ? "reference"
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

export function aggregateCoverageLabel(aggregate: NutrientAggregate | null | undefined) {
  if (!aggregate || aggregate.amount === null) return "Unknown";
  if (aggregate.complete) return "Complete";
  return `Partial · ${aggregate.knownItemCount} of ${aggregate.totalItemCount} items`;
}
