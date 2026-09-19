import type { InsightDay, InsightEntry } from "./types";

export const WEEKLY_METRICS = ["calories", "proteinG", "fiberG", "sodiumMg", "caffeineMg"] as const;
export type WeeklyMetricKey = (typeof WEEKLY_METRICS)[number];

export type WeeklyPeriod = {
  start: string;
  end: string;
  days: InsightDay[];
  entries: InsightEntry[];
};

export type WeeklyMetricSummary = {
  key: WeeklyMetricKey;
  total: number | null;
  average: number | null;
  recordedDays: number;
  knownItemCount: number | null;
  totalItemCount: number | null;
};

export type ContributionSource = {
  id: string;
  date: string;
  name: string;
  amount: number;
  contribution: number;
};

export type WaterfallContribution = {
  key: string;
  label: string;
  previous: number;
  current: number;
  difference: number;
  previousSources: ContributionSource[];
  currentSources: ContributionSource[];
  kind: "food" | "entry-adjustment" | "unavailable" | "other";
};

export type WeeklyChangesResult = {
  previous: WeeklyPeriod;
  current: WeeklyPeriod;
  metrics: Record<WeeklyMetricKey, { previous: WeeklyMetricSummary; current: WeeklyMetricSummary }>;
  waterfall: WaterfallContribution[];
  calorieDifference: number | null;
};

const DAY_MS = 86_400_000;

function dateOffset(date: string, offset: number) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid calendar date: ${date}`);
  return new Date(Date.UTC(year, month - 1, day) + offset * DAY_MS).toISOString().slice(0, 10);
}

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecorded(day: InsightDay) {
  return day.mealCount > 0;
}

function selectPeriod(days: InsightDay[], entries: InsightEntry[], start: string, end: string): WeeklyPeriod {
  return {
    start,
    end,
    days: days.filter((day) => day.date >= start && day.date <= end && isRecorded(day)),
    entries: entries.filter((entry) => entry.date >= start && entry.date <= end),
  };
}

export function getWeeklyPeriods(days: InsightDay[], entries: InsightEntry[], currentDate: string) {
  const currentEnd = dateOffset(currentDate, -1);
  const currentStart = dateOffset(currentDate, -7);
  const previousEnd = dateOffset(currentDate, -8);
  const previousStart = dateOffset(currentDate, -14);
  return {
    current: selectPeriod(days, entries, currentStart, currentEnd),
    previous: selectPeriod(days, entries, previousStart, previousEnd),
  };
}

export function summarizeMetric(period: WeeklyPeriod, key: WeeklyMetricKey): WeeklyMetricSummary {
  const recordedDays = period.days.length;
  if (recordedDays === 0) {
    return { key, total: null, average: null, recordedDays: 0, knownItemCount: key === "calories" || key === "proteinG" ? null : 0, totalItemCount: key === "calories" || key === "proteinG" ? null : 0 };
  }

  if (key === "calories" || key === "proteinG") {
    const total = period.days.reduce((sum, day) => sum + finite(day[key]), 0);
    return { key, total, average: total / recordedDays, recordedDays, knownItemCount: null, totalItemCount: null };
  }

  let total = 0;
  let knownItemCount = 0;
  let totalItemCount = 0;
  let hasKnownAmount = false;
  for (const day of period.days) {
    const aggregate = day.nutrients[key];
    totalItemCount += finite(aggregate?.totalItemCount);
    knownItemCount += finite(aggregate?.knownItemCount);
    if (aggregate?.amount !== null && aggregate?.amount !== undefined && Number.isFinite(aggregate.amount)) {
      total += aggregate.amount;
      hasKnownAmount = true;
    }
  }
  return {
    key,
    total: hasKnownAmount ? total : null,
    average: hasKnownAmount ? total / recordedDays : null,
    recordedDays,
    knownItemCount,
    totalItemCount,
  };
}

type MutableContribution = Omit<WaterfallContribution, "difference">;

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase();
}

function itemMetric(item: InsightEntry["items"][number], key: WeeklyMetricKey) {
  if (key === "calories" || key === "proteinG") return finite(item[key]);
  const value = item.nutrients?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dayMetric(day: InsightDay, key: WeeklyMetricKey) {
  if (key === "calories" || key === "proteinG") return finite(day[key]);
  return finite(day.nutrients[key]?.amount);
}

function periodContributions(period: WeeklyPeriod, metric: WeeklyMetricKey) {
  const result = new Map<string, { label: string; calories: number; sources: ContributionSource[]; kind: WaterfallContribution["kind"] }>();
  if (period.days.length === 0) return result;
  const add = (key: string, label: string, amount: number, source: Omit<ContributionSource, "contribution">, kind: WaterfallContribution["kind"]) => {
    const existing = result.get(key) ?? { label, calories: 0, sources: [], kind };
    existing.calories += amount / period.days.length;
    existing.sources.push({ ...source, contribution: amount / period.days.length });
    result.set(key, existing);
  };

  for (const entry of period.entries) {
    let itemTotal = 0;
    for (const item of entry.items) {
      const amount = itemMetric(item, metric);
      if (amount === null) continue;
      itemTotal += amount;
      const normalized = normalizeName(item.name);
      const key = normalized ? `food:${normalized}` : "adjustment:unnamed";
      add(key, normalized ? item.name.trim() : "Unnamed items", amount, { id: entry.id, date: entry.date, name: item.name.trim() || "Unnamed item", amount }, normalized ? "food" : "entry-adjustment");
    }
    const entryTotal = metric === "calories" || metric === "proteinG" ? finite(entry[metric]) : itemTotal;
    const adjustment = entryTotal - itemTotal;
    if (Math.abs(adjustment) > 1e-9) {
      add("adjustment:entry", "Entry total adjustments", adjustment, { id: entry.id, date: entry.date, name: "Entry total adjustment", amount: adjustment }, "entry-adjustment");
    }
  }

  const aggregateAverage = period.days.reduce((sum, day) => sum + dayMetric(day, metric), 0) / period.days.length;
  const detailedAverage = [...result.values()].reduce((sum, value) => sum + value.calories, 0);
  const unavailable = aggregateAverage - detailedAverage;
  if (Math.abs(unavailable) > 1e-9) {
    result.set("unavailable", { label: "Entry details unavailable", calories: unavailable, sources: [], kind: "unavailable" });
  }
  return result;
}

export function calculateWaterfall(previous: WeeklyPeriod, current: WeeklyPeriod, metric: WeeklyMetricKey = "calories", limit = 7): WaterfallContribution[] {
  if (previous.days.length === 0 || current.days.length === 0) return [];
  const before = periodContributions(previous, metric);
  const after = periodContributions(current, metric);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const all: WaterfallContribution[] = [...keys].map((key) => {
    const left = before.get(key);
    const right = after.get(key);
    const value: MutableContribution = {
      key,
      label: right?.label ?? left?.label ?? key,
      previous: left?.calories ?? 0,
      current: right?.calories ?? 0,
      previousSources: left?.sources ?? [],
      currentSources: right?.sources ?? [],
      kind: right?.kind ?? left?.kind ?? "food",
    };
    return { ...value, difference: value.current - value.previous };
  }).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || a.label.localeCompare(b.label));

  if (all.length <= limit) return all;
  const visible = all.slice(0, Math.max(1, limit));
  const hidden = all.slice(visible.length);
  visible.push({
    key: "other",
    label: "Other entries",
    previous: hidden.reduce((sum, item) => sum + item.previous, 0),
    current: hidden.reduce((sum, item) => sum + item.current, 0),
    difference: hidden.reduce((sum, item) => sum + item.difference, 0),
    previousSources: hidden.flatMap((item) => item.previousSources),
    currentSources: hidden.flatMap((item) => item.currentSources),
    kind: "other",
  });
  return visible;
}

export function calculateWeeklyChanges(days: InsightDay[], entries: InsightEntry[], currentDate: string, contributionLimit = 7): WeeklyChangesResult {
  const { previous, current } = getWeeklyPeriods(days, entries, currentDate);
  const metrics = Object.fromEntries(WEEKLY_METRICS.map((key) => [key, {
    previous: summarizeMetric(previous, key),
    current: summarizeMetric(current, key),
  }])) as WeeklyChangesResult["metrics"];
  const beforeCalories = metrics.calories.previous.average;
  const afterCalories = metrics.calories.current.average;
  return {
    previous,
    current,
    metrics,
    waterfall: calculateWaterfall(previous, current, "calories", contributionLimit),
    calorieDifference: beforeCalories === null || afterCalories === null ? null : afterCalories - beforeCalories,
  };
}
