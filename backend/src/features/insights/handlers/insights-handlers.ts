import {
  isValidTimeZone,
  shiftDateKey,
} from "@app/common/features/core/utils/logical-date";
import { proteinGoalForDay } from "@app/common/features/goals/utils/daily-targets";
import { Hono } from "hono";
import { z } from "zod";
import type { SessionEnvironment } from "../../entries/handlers/types.js";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";

const timeZoneQuery = z.object({
  timezone: z
    .string()
    .refine(isValidTimeZone, "timezone must be a valid IANA timezone.")
    .optional(),
});

interface InsightsHandlerProps {
  logic: Pick<BackendLogic, "entryReads" | "settings" | "weights">;
}

/**
 * The reads of the insight panels: the recent entries, and the goals that
 * the panels compare them with. The protein target of each date is worked out
 * here because a goal per kilogram follows the weight of that date.
 */
export function createInsightsHandlers({ logic }: InsightsHandlerProps) {
  return new Hono<SessionEnvironment>().get(
    "/",
    validator("query", timeZoneQuery),
    async (context) => {
      const { ownerKey } = context.get("session");
      const history = await logic.entryReads.insightHistory({
        ownerKey,
        timeZone: context.req.valid("query").timezone,
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
      return context.json(
        {
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
        },
        200,
      );
    },
  );
}
