const weightFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function formatWeight(weightKg: number): string {
  return weightFormatter.format(weightKg);
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

/** The time of day a weight was saved, such as "3:45 PM". */
export function formatRecordedTime(
  recordedAt: number,
  timeZone: string,
): string {
  let formatter = clockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
    clockFormatters.set(timeZone, formatter);
  }
  return formatter.format(new Date(recordedAt));
}

const isWeight = (value: number | null): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** The average of the weights in the last `windowSize` days, for each day. */
function rollingAverages(values: readonly (number | null)[], windowSize = 7) {
  return values.map((_, index) => {
    const known = values
      .slice(Math.max(0, index - windowSize + 1), index + 1)
      .filter(isWeight);
    return known.length
      ? known.reduce((sum, entry) => sum + entry, 0) / known.length
      : null;
  });
}

/**
 * The axis of the chart. A value and an average share it, and the padding keeps
 * a flat series away from the edges.
 */
function chartScale(values: readonly (number | null)[]) {
  const finite = values.filter(isWeight);
  if (finite.length === 0) {
    return { heights: values.map(() => null), ticks: [] as number[] };
  }
  const observedMin = Math.min(...finite);
  const observedMax = Math.max(...finite);
  const padding = Math.max((observedMax - observedMin) * 0.2, 0.5);
  const min = Math.max(0, Math.floor((observedMin - padding) * 10) / 10);
  const max = Math.ceil((observedMax + padding) * 10) / 10;
  const range = Math.max(max - min, 1);
  return {
    heights: values.map((value) =>
      isWeight(value) ? ((value - min) / range) * 100 : null,
    ),
    ticks: [0, 0.25, 0.5, 0.75, 1]
      .map((ratio) => Math.round((min + range * ratio) * 10) / 10)
      .toReversed(),
  };
}

interface WeightChartDay {
  date: string;
  value: number | null;
  /** Where the point sits, in percent of the plot height. */
  height: number | null;
}

export interface WeightChart {
  days: WeightChartDay[];
  ticks: number[];
  /** Points of the lines in a 100 by 100 box. A gap in the days splits the raw line. */
  rawSegments: string[][];
  averageLine: string[];
  latestAverage: number | null;
  /** The change of the average from the first known average. `null` with fewer than two. */
  weeklyChange: number | null;
  hasData: boolean;
}

/** The days in view and their weights, as the dashboard gives them. */
export interface WeightSlotData {
  /** The days, oldest first. */
  dates: string[];
  weights: { logicalDate: string; weightKg: number }[];
  selectedDate: string | null;
}

/** The chart of the weights of some days, oldest first. A day without a weight is a gap. */
export function buildWeightChart({
  dates,
  weights,
}: Pick<WeightSlotData, "dates" | "weights">): WeightChart {
  const byDate = new Map(
    weights.map(({ logicalDate, weightKg }) => [logicalDate, weightKg]),
  );
  const values = dates.map((date) => byDate.get(date) ?? null);
  const averages = rollingAverages(values);
  // Even entries are the days, and odd entries are their averages, on one scale.
  const scale = chartScale(
    values.flatMap((value, i) => [value, averages[i] ?? null]),
  );
  const rawSegments: string[][] = [];
  values.forEach((value, index) => {
    if (value === null) {
      return;
    }
    const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
    const y = 100 - (scale.heights[index * 2] ?? 0);
    if (index === 0 || values[index - 1] === null) {
      rawSegments.push([]);
    }
    rawSegments.at(-1)?.push(`${x},${y}`);
  });
  const averageLine = averages.flatMap((average, index) => {
    if (average === null) {
      return [];
    }
    const x =
      averages.length === 1 ? 50 : (index / (averages.length - 1)) * 100;
    return [`${x},${100 - (scale.heights[index * 2 + 1] ?? 0)}`];
  });
  const known = averages.filter((value): value is number => value !== null);
  return {
    days: dates.map((date, index) => ({
      date,
      value: values[index] ?? null,
      height: scale.heights[index * 2] ?? null,
    })),
    ticks: scale.ticks,
    rawSegments,
    averageLine,
    latestAverage: averages.at(-1) ?? null,
    weeklyChange:
      known.length < 2
        ? null
        : (known.at(-1) ?? 0) - (known[Math.max(0, known.length - 8)] ?? 0),
    hasData: values.some((value) => value !== null),
  };
}
