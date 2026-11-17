import type { InsightDay } from "./insight-types.js";

export const WEEKLY_METRICS = [
  "calories",
  "proteinG",
  "fiberG",
  "sodiumMg",
  "caffeineMg",
] as const;
export type WeeklyMetricKey = (typeof WEEKLY_METRICS)[number];

export type WeeklyPeriod = {
  start: string;
  end: string;
  days: InsightDay[];
};

export type WeeklyMetricSummary = {
  key: WeeklyMetricKey;
  total: number | null;
  average: number | null;
  recordedDays: number;
  knownItemCount: number | null;
  totalItemCount: number | null;
};

export type WeeklyChangesResult = {
  previous: WeeklyPeriod;
  current: WeeklyPeriod;
  metrics: Record<
    WeeklyMetricKey,
    { previous: WeeklyMetricSummary; current: WeeklyMetricSummary }
  >;
};

const DAY_MS = 86_400_000;

function dateOffset(date: string, offset: number) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
  return new Date(Date.UTC(year, month - 1, day) + offset * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecorded(day: InsightDay) {
  return day.mealCount > 0;
}

function selectPeriod(
  days: InsightDay[],
  start: string,
  end: string,
): WeeklyPeriod {
  return {
    start,
    end,
    days: days.filter(
      (day) => day.date >= start && day.date <= end && isRecorded(day),
    ),
  };
}

function getWeeklyPeriods(days: InsightDay[], currentDate: string) {
  const currentEnd = dateOffset(currentDate, -1);
  const currentStart = dateOffset(currentDate, -7);
  const previousEnd = dateOffset(currentDate, -8);
  const previousStart = dateOffset(currentDate, -14);
  return {
    current: selectPeriod(days, currentStart, currentEnd),
    previous: selectPeriod(days, previousStart, previousEnd),
  };
}

function summarizeMetric(
  period: WeeklyPeriod,
  key: WeeklyMetricKey,
): WeeklyMetricSummary {
  const recordedDays = period.days.length;
  if (recordedDays === 0) {
    return {
      key,
      total: null,
      average: null,
      recordedDays: 0,
      knownItemCount: key === "calories" || key === "proteinG" ? null : 0,
      totalItemCount: key === "calories" || key === "proteinG" ? null : 0,
    };
  }

  if (key === "calories" || key === "proteinG") {
    const total = period.days.reduce((sum, day) => sum + finite(day[key]), 0);
    return {
      key,
      total,
      average: total / recordedDays,
      recordedDays,
      knownItemCount: null,
      totalItemCount: null,
    };
  }

  let total = 0;
  let knownItemCount = 0;
  let totalItemCount = 0;
  let hasKnownAmount = false;
  for (const day of period.days) {
    const aggregate = day.nutrients[key];
    totalItemCount += finite(aggregate?.totalItemCount);
    knownItemCount += finite(aggregate?.knownItemCount);
    if (
      aggregate?.amount !== null &&
      aggregate?.amount !== undefined &&
      Number.isFinite(aggregate.amount)
    ) {
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

export function calculateWeeklyChanges(
  days: InsightDay[],
  currentDate: string,
): WeeklyChangesResult {
  const { previous, current } = getWeeklyPeriods(days, currentDate);
  const metrics = Object.fromEntries(
    WEEKLY_METRICS.map((key) => [
      key,
      {
        previous: summarizeMetric(previous, key),
        current: summarizeMetric(current, key),
      },
    ]),
  ) as WeeklyChangesResult["metrics"];
  return { previous, current, metrics };
}
