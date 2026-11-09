import {
  isDateKey,
  isValidTimeZone,
} from "@app/common/features/core/utils/logical-date";
import { Hono } from "hono";
import { z } from "zod";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";
import { serialiseEntry } from "../utils/entry-rows.js";
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
  logic: Pick<BackendLogic, "entryReads" | "settings">;
}

/** The reads of the owner dashboard: one day of entries, and the recent days with the goals. */
export function createDashboardHandlers({ logic }: DashboardHandlerProps) {
  return new Hono<SessionEnvironment>()
    .get(
      "/days/:date",
      validator("param", dateParam),
      validator("query", timeZoneQuery),
      async (context) => {
        const day = await logic.entryReads.day({
          ownerKey: context.get("session").ownerKey,
          date: context.req.valid("param").date,
          timeZone: context.req.valid("query").timezone,
        });
        return context.json(
          {
            date: day.date,
            timezone: day.timeZone,
            meals: day.entries.map(serialiseEntry),
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
        const [summary, targets] = await Promise.all([
          logic.entryReads.summary({
            ownerKey,
            timeZone: context.req.valid("query").timezone,
          }),
          logic.settings.dailyTargets({ ownerKey }),
        ]);
        return context.json(
          {
            date: summary.date,
            timezone: summary.timeZone,
            targets,
            days: summary.days,
            averageCalories: summary.averageCalories,
          },
          200,
        );
      },
    );
}
