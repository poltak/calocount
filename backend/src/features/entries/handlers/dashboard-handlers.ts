import {
  isDateKey,
  isValidTimeZone,
} from "@app/common/features/core/utils/logical-date";
import { Hono } from "hono";
import { z } from "zod";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";
import { serialiseEntry } from "../utils/entry-rows.js";
import { proteinGoalOfDay } from "./protein-goal.js";
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

interface DashboardHandlerProps {
  logic: Pick<BackendLogic, "entryReads" | "settings" | "weights">;
}

/** The reads of the owner dashboard: one day of entries and its weight, and the recent days with the goals and weights. */
export function createDashboardHandlers({ logic }: DashboardHandlerProps) {
  return new Hono<SessionEnvironment>()
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
        const [weights, todayProtein] = await Promise.all([
          logic.weights.range({ ownerKey, from: firstDate, to: summary.date }),
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
            recentWeights: weights,
          },
          200,
        );
      },
    );
}
