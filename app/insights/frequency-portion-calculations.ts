import type { InsightEntry, InsightItem } from "./types";

export const frequencyPortionMetrics = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "fiberG", label: "Fiber", unit: "g" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
  { key: "caffeineMg", label: "Caffeine", unit: "mg" },
] as const;

export type FrequencyPortionMetric = (typeof frequencyPortionMetrics)[number]["key"];
export type FrequencyPortionRange = 7 | 30;

export type FrequencyPortionSource = {
  entryId: string;
  date: string;
  consumedAt: number;
  value: number | null;
  knownItemCount: number;
  totalItemCount: number;
  quantity: number | null;
  unit: string | null;
};

export type FrequencyPortionPoint = {
  key: string;
  label: string;
  occurrences: number;
  occurrencesPerWeek: number;
  averageValue: number | null;
  totalValue: number | null;
  knownCount: number;
  completeKnownCount: number;
  averageQuantity: number | null;
  quantityUnit: string | null;
  sources: FrequencyPortionSource[];
};

export type FrequencyPortionResult = {
  startDate: string;
  endDate: string;
  elapsedDays: number;
  points: FrequencyPortionPoint[];
};

/** A readable 1/2/5-based upper bound that always contains the data. */
export function frequencyAxisMaximum(values: readonly number[], minimum = 1) {
  const largest = Math.max(minimum, ...values.filter((value) => Number.isFinite(value) && value >= 0));
  const magnitude = 10 ** Math.floor(Math.log10(largest));
  const normalized = largest / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function addDays(date: string, amount: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

export function normalizeFoodName(name: string) {
  return name.trim().toLowerCase();
}

function knownMetric(item: InsightItem, metric: FrequencyPortionMetric) {
  const raw = metric === "calories" || metric === "proteinG"
    ? item[metric]
    : item.nutrients?.[metric];
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
}

type EntryFood = {
  label: string;
  value: number | null;
  knownItemCount: number;
  totalItemCount: number;
  quantity: number | null;
  unit: string | null;
};

function foodsInEntry(entry: InsightEntry, metric: FrequencyPortionMetric) {
  const foods = new Map<string, EntryFood>();
  for (const item of entry.items) {
    const key = normalizeFoodName(item.name);
    if (!key) continue;
    const value = knownMetric(item, metric);
    const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity >= 0
      ? item.quantity
      : null;
    const unit = item.unit?.trim() || null;
    const current = foods.get(key);
    if (!current) {
      foods.set(key, {
        label: item.name.trim(),
        value,
        knownItemCount: value === null ? 0 : 1,
        totalItemCount: 1,
        quantity,
        unit: quantity === null ? null : unit,
      });
      continue;
    }

    // Repeated rows for the same exact food in one log are one occurrence.
    // Their known nutrition and compatible quantities are summed.
    if (value !== null) current.value = (current.value ?? 0) + value;
    current.knownItemCount += value === null ? 0 : 1;
    current.totalItemCount += 1;
    if (current.quantity !== null && quantity !== null && current.unit === unit) {
      current.quantity += quantity;
    } else {
      current.quantity = null;
      current.unit = null;
    }
  }
  return foods;
}

export function calculateFrequencyPortion({
  entries,
  currentDate,
  range,
  metric,
}: {
  entries: readonly InsightEntry[];
  currentDate: string;
  range: FrequencyPortionRange;
  metric: FrequencyPortionMetric;
}): FrequencyPortionResult {
  const startDate = addDays(currentDate, -range);
  const endDate = addDays(currentDate, -1);
  const grouped = new Map<string, {
    label: string;
    sources: FrequencyPortionSource[];
  }>();

  for (const entry of entries) {
    if (entry.date < startDate || entry.date > endDate) continue;
    for (const [key, food] of foodsInEntry(entry, metric)) {
      const group = grouped.get(key) ?? { label: food.label, sources: [] };
      group.sources.push({
        entryId: entry.id,
        date: entry.date,
        consumedAt: entry.consumedAt,
        value: food.value,
        knownItemCount: food.knownItemCount,
        totalItemCount: food.totalItemCount,
        quantity: food.quantity,
        unit: food.unit,
      });
      grouped.set(key, group);
    }
  }

  const weeks = range / 7;
  const points = [...grouped.entries()].map(([key, group]): FrequencyPortionPoint => {
    const known = group.sources.filter((source) => source.value !== null);
    const totalValue = known.length
      ? known.reduce((total, source) => total + (source.value ?? 0), 0)
      : null;
    const quantities = group.sources.filter((source) => source.quantity !== null);
    const quantityUnit = quantities.length === group.sources.length &&
      quantities.every((source) => source.unit === quantities[0]?.unit)
      ? quantities[0]?.unit ?? null
      : null;
    const averageQuantity = quantities.length === group.sources.length && quantityUnit !== null
      ? quantities.reduce((total, source) => total + (source.quantity ?? 0), 0) / quantities.length
      : null;
    return {
      key,
      label: group.label,
      occurrences: group.sources.length,
      occurrencesPerWeek: group.sources.length / weeks,
      averageValue: totalValue === null ? null : totalValue / known.length,
      totalValue,
      knownCount: known.length,
      completeKnownCount: group.sources.filter((source) => source.knownItemCount === source.totalItemCount).length,
      averageQuantity,
      quantityUnit,
      sources: [...group.sources].sort((left, right) => right.date.localeCompare(left.date) || right.consumedAt - left.consumedAt),
    };
  }).sort((left, right) => right.occurrencesPerWeek - left.occurrencesPerWeek ||
    (right.averageValue ?? -1) - (left.averageValue ?? -1) || left.label.localeCompare(right.label));

  return { startDate, endDate, elapsedDays: range, points };
}
