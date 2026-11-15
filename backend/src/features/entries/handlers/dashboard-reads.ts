import { shiftDateKey } from "@app/common/features/core/utils/logical-date";
import type { BackendLogic } from "../../core/types.js";
import { proteinGoalOfDay, proteinTargetsOfDays } from "./protein-goal.js";

export type DashboardReadLogic = Pick<
  BackendLogic,
  "entryReads" | "settings" | "weights"
>;

interface DashboardReadProps {
  logic: DashboardReadLogic;
  ownerKey: string;
  /** Unset means UTC. The public reads give the owner's saved timezone. */
  timeZone: string | undefined;
}

/** The entries of one day, the weight of the day, and the protein goal of the day. */
export async function readDayOf({
  logic,
  ownerKey,
  timeZone,
  date,
}: DashboardReadProps & { date: string }) {
  const [day, weight, goals] = await Promise.all([
    logic.entryReads.day({ ownerKey, date, timeZone }),
    logic.weights.day({ ownerKey, date }),
    logic.settings.dailyGoals({ ownerKey }),
  ]);
  const proteinGoal = await proteinGoalOfDay({
    logic,
    ownerKey,
    date,
    goals,
    dayWeight: weight,
  });
  return {
    date: day.date,
    timezone: day.timeZone,
    entries: day.entries,
    weight,
    proteinGoal,
  };
}

/** The totals of each day with entries in a month, and where the log starts. */
export async function readMonthOf({
  logic,
  ownerKey,
  timeZone,
  month,
}: DashboardReadProps & { month: string }) {
  const [read, firstWeightDate] = await Promise.all([
    logic.entryReads.month({ ownerKey, month, timeZone }),
    logic.weights.firstDate({ ownerKey }),
  ]);
  const firstDates = [read.firstEntryDate, firstWeightDate].filter(
    (date) => date !== null,
  );
  return {
    month: read.month,
    timezone: read.timeZone,
    firstDate: firstDates.toSorted()[0] ?? null,
    days: read.days,
  };
}

/** The summary of the recent days, without the fields that belong to the signed-in profile. */
export async function readSummary({
  logic,
  ownerKey,
  timeZone,
}: DashboardReadProps) {
  const [summary, goals] = await Promise.all([
    logic.entryReads.summary({ ownerKey, timeZone }),
    logic.settings.dailyGoals({ ownerKey }),
  ]);
  const firstDate = summary.days[0]?.date ?? summary.date;
  const firstTrendDate = summary.trendDays[0]?.date ?? firstDate;
  const [trendWeights, weightBefore, todayProtein] = await Promise.all([
    logic.weights.range({
      ownerKey,
      from: firstTrendDate,
      to: summary.date,
    }),
    goals.proteinMode === "gramsPerKg"
      ? logic.weights.latestOnOrBefore({
          ownerKey,
          date: shiftDateKey(firstTrendDate, -1),
        })
      : undefined,
    proteinGoalOfDay({ logic, ownerKey, date: summary.date, goals }),
  ]);
  return {
    date: summary.date,
    timezone: summary.timeZone,
    targets: {
      calories: goals.calories,
      proteinG: todayProtein.targetG,
      nutrients: goals.nutrients,
    },
    days: summary.days,
    averageCalories: summary.averageCalories,
    recentWeights: trendWeights.filter(
      (weight) => weight.logicalDate >= firstDate,
    ),
    trend: {
      days: summary.trendDays,
      weights: trendWeights,
      proteinTargets: proteinTargetsOfDays({
        dates: summary.trendDays.map((day) => day.date),
        goals,
        weights: trendWeights,
        weightBefore,
      }),
    },
  };
}
