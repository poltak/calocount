import { Hono } from "hono";
import { validator } from "../../core/handlers/validator.js";
import type { ProfileEnvironment } from "../../core/handlers/types.js";
import { serialiseEntry } from "../utils/entry-rows.js";
import {
  readDayOf,
  readMonthOf,
  readSummary,
  type DashboardReadLogic,
} from "./dashboard-reads.js";
import { dateParam, monthQuery, timeZoneQuery } from "./dashboard-schemas.js";

interface DashboardHandlerProps {
  logic: DashboardReadLogic;
}

/** The reads of the owner dashboard: one day of entries and its weight, a month of totals, and the recent days with the goals and weights. */
export function createDashboardHandlers({ logic }: DashboardHandlerProps) {
  return new Hono<ProfileEnvironment>()
    .get("/days", validator("query", monthQuery), async (context) => {
      const { ownerKey } = context.get("session");
      const { month, timezone } = context.req.valid("query");
      return context.json(
        await readMonthOf({ logic, ownerKey, timeZone: timezone, month }),
        200,
      );
    })
    .get(
      "/days/:date",
      validator("param", dateParam),
      validator("query", timeZoneQuery),
      async (context) => {
        const { ownerKey } = context.get("session");
        const read = await readDayOf({
          logic,
          ownerKey,
          timeZone: context.req.valid("query").timezone,
          date: context.req.valid("param").date,
        });
        return context.json(
          {
            date: read.date,
            timezone: read.timezone,
            meals: read.entries.map(serialiseEntry),
            weight: read.weight ?? null,
            proteinGoal: read.proteinGoal,
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
        const [read, partnerProfileEnabled] = await Promise.all([
          readSummary({
            logic,
            ownerKey,
            timeZone: context.req.valid("query").timezone,
          }),
          logic.settings.partnerProfileEnabled({
            accountKey: context.get("accountKey"),
          }),
        ]);
        return context.json(
          {
            date: read.date,
            timezone: read.timezone,
            profile: context.get("profile"),
            partnerProfileEnabled,
            targets: read.targets,
            days: read.days,
            averageCalories: read.averageCalories,
            recentWeights: read.recentWeights,
            trend: read.trend,
            history: read.history,
          },
          200,
        );
      },
    );
}
