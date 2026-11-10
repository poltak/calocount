import {
  isDateKey,
  isMonthKey,
  isValidTimeZone,
  shiftDateKey,
} from "@app/common/features/core/utils/logical-date";
import { Hono } from "hono";
import { z } from "zod";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";
import { serialiseEntry } from "../utils/entry-rows.js";
import { proteinGoalOfDay, proteinTargetsOfDays } from "./protein-goal.js";
import type { SessionEnvironment } from "./types.js";

const timeZoneQuery = z.object({
  timezone: z
    .string()
    .refine(isValidTimeZone, "timezone must be a valid IANA timezone.")
    .optional(),
});

const dateParam = z.object({
  date: z
    .string()
    .refine(isDateKey, "The date must be a valid YYYY-MM-DD date."),
});

const monthQuery = timeZoneQuery.extend({
  month: z.string().refine(isMonthKey, "month must be a valid YYYY-MM month."),
});

interface DashboardHandlerProps {
  logic: Pick<BackendLogic, "entryReads" | "settings" | "weights">;
}

/** The reads of the owner dashboard: one day of entries and its weight, a month of totals, and the recent days with the goals and weights. */
export function createDashboardHandlers({ logic }: DashboardHandlerProps) {
  return new Hono<SessionEnvironment>()
    .get("/days", validator("query", monthQuery), async (context) => {
      const { ownerKey } = context.get("session");
      const { month, timezone } = context.req.valid("query");
      const [read, firstWeightDate] = await Promise.all([
        logic.entryReads.month({ ownerKey, month, timeZone: timezone }),
        logic.weights.firstDate({ ownerKey }),
      ]);
      const firstDates = [read.firstEntryDate, firstWeightDate].filter(
        (date) => date !== null,
      );
      return context.json(
        {
          month: read.month,
          timezone: read.timeZone,
          firstDate: firstDates.toSorted()[0] ?? null,
          days: read.days,
        },
        200,
      );
    })
    .get(
      "/days/:date",
      validator("param", dateParam),
      validator("query", timeZoneQuery),
      async (context) => {
        const { ownerKey } = context.get("session");
        const { date } = context.req.valid("param");
        const [day, weight, goals] = await Promise.all([
          logic.entryReads.day({
            ownerKey,
            date,
            timeZone: context.req.valid("query").timezone,
          }),
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
        return context.json(
          {
            date: day.date,
            timezone: day.timeZone,
            meals: day.entries.map(serialiseEntry),
            weight: weight ?? null,
            proteinGoal,
          },
          200,
        );
      },
    )
    .get(
      "/dashboard/summary",
      validator("query", timeZoneQuery),
      async (context) => {
        const { ownerKey } = context.get("session");
        const [summary, goals] = await Promise.all([
          logic.entryReads.summary({
            ownerKey,
            timeZone: context.req.valid("query").timezone,
          }),
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
        return context.json(
          {
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
          },
          200,
        );
      },
    );
}
