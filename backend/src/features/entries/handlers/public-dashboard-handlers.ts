import { Hono } from "hono";
import { validator } from "../../core/handlers/validator.js";
import type { PublicViewEnvironment } from "../../core/handlers/types.js";
import {
  publicEntryOf,
  publicSummaryOf,
  publicWeightOf,
} from "../utils/public-entry.js";
import {
  readDayOf,
  readMonthOf,
  readSummary,
  type DashboardReadLogic,
} from "./dashboard-reads.js";
import { dateParam, monthQuery, timeZoneQuery } from "./dashboard-schemas.js";

interface PublicDashboardHandlerProps {
  logic: DashboardReadLogic;
}

/**
 * The public mirrors of the owner dashboard reads. Each body is a subtype of
 * the owner body. The `timezone` query is accepted and not read, because the
 * days of a visitor count in the owner's saved timezone.
 */
export function createPublicDashboardHandlers({
  logic,
}: PublicDashboardHandlerProps) {
  return new Hono<PublicViewEnvironment>()
    .get("/days", validator("query", monthQuery), async (context) => {
      const { ownerKey, timeZone } = context.get("publicOwner");
      return context.json(
        await readMonthOf({
          logic,
          ownerKey,
          timeZone,
          month: context.req.valid("query").month,
        }),
        200,
      );
    })
    .get(
      "/days/:date",
      validator("param", dateParam),
      validator("query", timeZoneQuery),
      async (context) => {
        const { ownerKey, timeZone } = context.get("publicOwner");
        const [read, today] = await Promise.all([
          readDayOf({
            logic,
            ownerKey,
            timeZone,
            date: context.req.valid("param").date,
          }),
          logic.entryReads.today({ ownerKey, timeZone }),
        ]);
        return context.json(
          {
            date: read.date,
            timezone: read.timezone,
            meals: read.entries
              .filter(({ meal }) => meal.status === "complete")
              .map((entry) =>
                publicEntryOf({ entry, today: today.date, timeZone }),
              ),
            weight: read.weight ? publicWeightOf(read.weight) : null,
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
        const { ownerKey, timeZone } = context.get("publicOwner");
        return context.json(
          publicSummaryOf(await readSummary({ logic, ownerKey, timeZone })),
          200,
        );
      },
    );
}
