import { shiftDateKey } from "@app/common/features/core/utils/logical-date";
import { proteinGoalForDay } from "@app/common/features/goals/utils/daily-targets";
import type { BackendLogic } from "../../core/types.js";

export type InsightsReadLogic = Pick<
  BackendLogic,
  "entryReads" | "settings" | "weights"
>;

/**
 * The recent entries, and the goals that the panels compare them with. The
 * protein target of each date is worked out here because a goal per kilogram
 * follows the weight of that date.
 */
export async function readInsights({
  logic,
  ownerKey,
  timeZone,
}: {
  logic: InsightsReadLogic;
  ownerKey: string;
  timeZone: string | undefined;
}) {
  const history = await logic.entryReads.insightHistory({
    ownerKey,
    timeZone,
  });
  const [goals, settings, weights, earlierWeight] = await Promise.all([
    logic.settings.dailyGoals({ ownerKey }),
    logic.settings.read({ ownerKey }),
    logic.weights.range({
      ownerKey,
      from: history.fromDate,
      to: history.toDate,
    }),
    logic.weights.latestOnOrBefore({
      ownerKey,
      date: shiftDateKey(history.fromDate, -1),
    }),
  ]);
  const weightByDate = new Map(
    weights.map((weight) => [weight.logicalDate, weight]),
  );
  let latestWeight = earlierWeight;
  const proteinTargets = [];
  for (
    let date = history.fromDate;
    date <= history.toDate;
    date = shiftDateKey(date, 1)
  ) {
    latestWeight = weightByDate.get(date) ?? latestWeight;
    proteinTargets.push({
      date,
      targetG: proteinGoalForDay({
        mode: goals.proteinMode,
        fixedTargetG: goals.fixedProteinG,
        gramsPerKg: goals.proteinGramsPerKg,
        weight: latestWeight
          ? {
              weightKg: latestWeight.weightKg,
              logicalDate: latestWeight.logicalDate,
            }
          : null,
      }).targetG,
    });
  }
  return {
    timezone: history.timeZone,
    fromDate: history.fromDate,
    toDate: history.toDate,
    entries: history.entries,
    calorieTarget: goals.calories,
    nutrientGoals: goals.nutrients,
    proteinTargets,
    referenceSettings: {
      vitaminB6UsFnbAdultUlEnabled:
        settings?.vitaminB6UsFnbAdultUlEnabled === 1,
      usFnbAdultUlEnabled: settings?.usFnbAdultUlEnabled === 1,
    },
  };
}
