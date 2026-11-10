import {
  shiftDateKey,
  zonedCalendar,
} from "@app/common/features/core/utils/logical-date";
import {
  NUTRIENT_KEYS,
  aggregateNutrients,
  nullableNutrientValue,
  type NutrientAggregateMap,
} from "@app/common/features/entries/utils/nutrients";
import {
  isValidProteinPerKg,
  normaliseProteinGoalMode,
  proteinGoalForDay,
} from "@app/common/features/goals/utils/daily-targets";
import {
  publicDayTotals,
  publicMeal,
  publicWeight,
  roundAmount,
} from "../utils/public-projection.js";
import type { PublicLogic } from "./public-reads.js";

/** The trend charts show this many days, ending today. */
const TREND_DAYS = 30;
/** The insights read one more finished day than the trend shows. */
const INSIGHT_DAYS_BEFORE = 30;
const RECENT_DAYS = 7;

function publicAmount(value: unknown): number | null {
  const amount = nullableNutrientValue(value);
  return amount === null ? null : roundAmount(amount);
}

function publicAggregates(source: NutrientAggregateMap) {
  return Object.fromEntries(
    NUTRIENT_KEYS.map((key) => {
      const aggregate = source[key];
      return [
        key,
        {
          amount: publicAmount(aggregate.amount),
          knownItemCount: aggregate.knownItemCount,
          totalItemCount: aggregate.totalItemCount,
          complete: aggregate.complete,
        },
      ];
    }),
  ) as NutrientAggregateMap;
}

/**
 * The 30-day projection that the old app returned when no view was asked for:
 * the targets, the totals and nutrients of the recent days, the weights, the
 * food items of the last 31 days for the insights, and the entries of the last
 * seven days. Each field is named, so no private field leaves the server.
 */
export async function readDashboard({
  logic,
  ownerKey,
  timeZone,
}: {
  logic: PublicLogic;
  ownerKey: string;
  timeZone: string;
}) {
  const [summary, recent, settings, goals] = await Promise.all([
    logic.entryReads.summary({ ownerKey, timeZone }),
    logic.entryReads.lastDays({
      ownerKey,
      timeZone,
      daysBefore: INSIGHT_DAYS_BEFORE,
    }),
    logic.settings.read({ ownerKey }),
    logic.settings.dailyGoals({ ownerKey }),
  ]);
  const { date } = summary;
  const calendar = zonedCalendar(summary.timeZone);
  const insightStart = shiftDateKey(date, -INSIGHT_DAYS_BEFORE);
  const trendStart = shiftDateKey(date, 1 - TREND_DAYS);
  const recentStart = shiftDateKey(date, 1 - RECENT_DAYS);
  const [weights, weightBefore] = await Promise.all([
    logic.weights.range({ ownerKey, from: insightStart, to: date }),
    logic.weights.latestOnOrBefore({
      ownerKey,
      date: shiftDateKey(insightStart, -1),
    }),
  ]);

  const mode = normaliseProteinGoalMode(settings?.proteinGoalMode);
  const fixedTargetG =
    (settings?.dailyProteinTargetG ?? 0) > 0
      ? (settings?.dailyProteinTargetG ?? null)
      : null;
  const gramsPerKg = settings?.dailyProteinTargetPerKg ?? null;
  const knownWeights = weightBefore ? [weightBefore, ...weights] : weights;
  const proteinByDate = Array.from({ length: 31 }, (_, index) => {
    const day = shiftDateKey(insightStart, index);
    return {
      date: day,
      ...proteinGoalForDay({
        mode,
        fixedTargetG,
        gramsPerKg,
        weight:
          knownWeights.findLast((weight) => weight.logicalDate <= day) ?? null,
      }),
    };
  });
  const currentProtein = proteinByDate.at(-1);

  const week = summary.days;
  const today = summary.trendDays.at(-1);
  const completeEntries = recent.entries.filter(
    ({ meal }) => meal.status === "complete",
  );
  const weekStartMs = calendar.firstInstant(recentStart);
  const weekEntries = recent.entries.filter(
    ({ meal }) => meal.consumedAt >= weekStartMs,
  );
  return {
    date,
    // The timezone that sets the day boundaries of every date in this response.
    timezone: summary.timeZone,
    targets: {
      calories: settings?.dailyCalorieTarget ?? null,
      proteinG: currentProtein?.targetG ?? null,
      nutrients: Object.fromEntries(
        NUTRIENT_KEYS.map((key) => [
          key,
          {
            value: goals.nutrients[key].value,
            direction: goals.nutrients[key].direction,
          },
        ]),
      ),
    },
    proteinGoal: {
      mode,
      gramsPerKg:
        mode === "gramsPerKg" &&
        gramsPerKg !== null &&
        isValidProteinPerKg(gramsPerKg)
          ? gramsPerKg
          : null,
      fixedTargetG,
      targetG: currentProtein?.targetG ?? null,
      weightKg: currentProtein?.weightKg ?? null,
      weightDate: currentProtein?.weightDate ?? null,
      byDate: proteinByDate,
    },
    today: today ? publicDayTotals(today) : null,
    sevenDay: {
      calories: roundAmount(week.reduce((sum, day) => sum + day.calories, 0)),
      proteinG: roundAmount(week.reduce((sum, day) => sum + day.proteinG, 0)),
      averageCalories: roundAmount(summary.averageCalories),
      averageProteinG: roundAmount(summary.averageProteinG),
      daysWithMeals: week.filter((day) => day.mealCount > 0).length,
      trend: week.map(publicDayTotals),
    },
    trend: {
      byDate: summary.trendDays.map((day) => ({
        ...publicDayTotals(day),
        nutrients: publicAggregates(day.nutrients),
      })),
      // Newest first, as the old app listed them.
      weights: weights
        .filter((weight) => weight.logicalDate >= trendStart)
        .toReversed()
        .map(publicWeight),
    },
    nutrition: {
      today: today ? publicAggregates(today.nutrients) : null,
      sevenDay: publicAggregates(
        aggregateNutrients(
          weekEntries
            .filter(({ meal }) => meal.status === "complete")
            .flatMap(({ items }) => items),
        ),
      ),
      byDate: week.map((day) => ({
        date: day.date,
        nutrients: publicAggregates(day.nutrients),
      })),
    },
    insights: {
      fromDate: insightStart,
      toDate: date,
      entries: completeEntries.map(({ meal, items }) => ({
        id: meal.id,
        date: calendar.dateKey(meal.consumedAt),
        consumedAt: meal.consumedAt,
        calories: roundAmount(meal.totalCalories),
        proteinG: roundAmount(meal.totalProteinG),
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          calories: roundAmount(item.calories),
          proteinG: roundAmount(item.proteinG),
          nutrients: Object.fromEntries(
            NUTRIENT_KEYS.map((key) => [key, publicAmount(item[key])]),
          ),
        })),
      })),
    },
    recentMeals: weekEntries
      .filter(({ meal }) => meal.status === "complete")
      .map((entry) =>
        publicMeal({ entry, summaryDate: date, timeZone: summary.timeZone }),
      ),
    recentWeights: weights
      .filter((weight) => weight.logicalDate >= recentStart)
      .toReversed()
      .map(publicWeight),
  };
}
