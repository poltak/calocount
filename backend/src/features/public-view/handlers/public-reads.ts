import {
  shiftDateKey,
  shiftMonthKey,
  zonedCalendar,
} from "@app/common/features/core/utils/logical-date";
import {
  normaliseProteinGoalMode,
  proteinGoalForDay,
} from "@app/common/features/goals/utils/daily-targets";
import type { BackendLogic } from "../../core/types.js";
import {
  publicDayTotals,
  publicMeal,
  publicWeight,
  roundAmount,
} from "../utils/public-projection.js";

export type PublicLogic = Pick<
  BackendLogic,
  "entryReads" | "settings" | "weights"
>;

/** The daily view covers at most this many days, ending today. */
const MAX_DAILY_HISTORY_DAYS = 366;

interface ReadProps {
  logic: PublicLogic;
  ownerKey: string;
  /** The owner's saved timezone, or UTC. */
  timeZone: string;
}

type Settings = Awaited<ReturnType<PublicLogic["settings"]["read"]>>;

/** The protein target of one day. A goal per kilogram uses the latest weight up to that day. */
async function proteinGoalOf({
  logic,
  ownerKey,
  date,
  settings,
}: ReadProps & { date: string; settings: Settings }) {
  const mode = normaliseProteinGoalMode(settings?.proteinGoalMode);
  const weight =
    mode === "gramsPerKg"
      ? await logic.weights.latestOnOrBefore({ ownerKey, date })
      : undefined;
  return proteinGoalForDay({
    mode,
    fixedTargetG: settings?.dailyProteinTargetG ?? null,
    gramsPerKg: settings?.dailyProteinTargetPerKg ?? null,
    weight: weight
      ? { weightKg: weight.weightKg, logicalDate: weight.logicalDate }
      : null,
  });
}

/**
 * One row for each day since the first entry or weight, with no food items,
 * so an agent can read it whole.
 */
export async function readDaily({ logic, ownerKey, timeZone }: ReadProps) {
  const today = await logic.entryReads.today({ ownerKey, timeZone });
  const toDate = today.date;
  const [firstEntryDate, firstWeightDate, settings, goalChanges] =
    await Promise.all([
      logic.entryReads.firstDate({ ownerKey, timeZone }),
      logic.weights.firstDate({ ownerKey }),
      logic.settings.read({ ownerKey }),
      logic.settings.goalChanges({ ownerKey }),
    ]);
  const earliestDate = shiftDateKey(toDate, 1 - MAX_DAILY_HISTORY_DAYS);
  const firstTrackedDate =
    [firstEntryDate, firstWeightDate]
      .filter((date): date is string => date !== null && date <= toDate)
      .toSorted()[0] ?? toDate;
  const fromDate =
    firstTrackedDate < earliestDate ? earliestDate : firstTrackedDate;
  const [totals, weights, proteinGoal] = await Promise.all([
    logic.entryReads.dayTotals({ ownerKey, fromDate, toDate, timeZone }),
    logic.weights.range({ ownerKey, from: fromDate, to: toDate }),
    proteinGoalOf({ logic, ownerKey, timeZone, date: toDate, settings }),
  ]);
  const calendar = zonedCalendar(timeZone);
  const totalsByDate = new Map(totals.map((day) => [day.date, day]));
  const weightByDate = new Map(
    weights.map((weight) => [weight.logicalDate, weight.weightKg]),
  );
  const days = [];
  for (let date = fromDate; date <= toDate; date = shiftDateKey(date, 1)) {
    days.push({
      ...publicDayTotals(
        totalsByDate.get(date) ?? {
          date,
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
          mealCount: 0,
        },
      ),
      weightKg: weightByDate.get(date) ?? null,
    });
  }
  return {
    view: "daily" as const,
    date: toDate,
    // The timezone that sets the day boundaries of every date in this response.
    timezone: timeZone,
    units: {
      calories: "kcal",
      proteinG: "g",
      carbsG: "g",
      fatG: "g",
      weightKg: "kg",
    },
    firstEntryDate,
    firstWeightDate,
    fromDate,
    toDate,
    targets: {
      calories: settings?.dailyCalorieTarget ?? null,
      proteinG: proteinGoal.targetG,
    },
    // Each row gives the goals in effect from its date. Goals before the first row are not known.
    goalChanges: goalChanges.map((change) => {
      const proteinMode = normaliseProteinGoalMode(change.proteinGoalMode);
      return {
        date: calendar.dateKey(change.changedAt),
        changedAt: change.changedAt,
        calories: change.dailyCalorieTarget,
        proteinMode,
        // The value of the mode that is not selected has no effect, so it reads as null.
        proteinG: proteinMode === "grams" ? change.dailyProteinTargetG : null,
        proteinGramsPerKg:
          proteinMode === "gramsPerKg" ? change.dailyProteinTargetPerKg : null,
      };
    }),
    days,
  };
}

/** The totals of each day of one month that has entries, and where the log starts. */
export async function readMonth({
  logic,
  ownerKey,
  timeZone,
  month,
}: ReadProps & { month: string }) {
  const [days, firstEntryDate, firstWeightDate] = await Promise.all([
    logic.entryReads.dayTotals({
      ownerKey,
      timeZone,
      fromDate: `${month}-01`,
      toDate: shiftDateKey(`${shiftMonthKey(month, 1)}-01`, -1),
    }),
    logic.entryReads.firstDate({ ownerKey, timeZone }),
    logic.weights.firstDate({ ownerKey }),
  ]);
  return {
    view: "month" as const,
    month,
    timezone: timeZone,
    firstDate:
      [firstEntryDate, firstWeightDate]
        .filter((date): date is string => date !== null)
        .toSorted()[0] ?? null,
    days: days.map((day) => ({
      date: day.date,
      calories: roundAmount(day.calories),
      proteinG: roundAmount(day.proteinG),
      mealCount: day.mealCount,
    })),
  };
}

/** The complete entries of one day, with the weight and the protein goal of that day. */
export async function readDay({
  logic,
  ownerKey,
  timeZone,
  date,
}: ReadProps & { date: string }) {
  const today = await logic.entryReads.today({ ownerKey, timeZone });
  const [day, weight, settings] = await Promise.all([
    logic.entryReads.day({ ownerKey, date, timeZone }),
    logic.weights.day({ ownerKey, date }),
    logic.settings.read({ ownerKey }),
  ]);
  const proteinGoal = await proteinGoalOf({
    logic,
    ownerKey,
    timeZone,
    date,
    settings,
  });
  return {
    view: "day" as const,
    date,
    // The timezone that sets the day boundaries of the date.
    timezone: day.timeZone,
    meals: day.entries
      .filter((entry) => entry.meal.status === "complete")
      .map((entry) => publicMeal({ entry, summaryDate: today.date, timeZone })),
    weight: weight ? publicWeight(weight) : null,
    proteinGoal: {
      date,
      targetG: proteinGoal.targetG,
      weightKg: proteinGoal.weightKg,
      weightDate: proteinGoal.weightDate,
    },
  };
}
