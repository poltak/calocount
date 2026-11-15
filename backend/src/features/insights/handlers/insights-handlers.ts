import { Hono } from "hono";
import type { SessionEnvironment } from "../../entries/handlers/types.js";
import { isValidTimeZone } from "@app/common/features/core/utils/logical-date";
import { z } from "zod";
import { validator } from "../../core/handlers/validator.js";
import { readInsights, type InsightsReadLogic } from "./insights-read.js";

export const timeZoneQuery = z.object({
  timezone: z
    .string()
    .refine(isValidTimeZone, "timezone must be a valid IANA timezone.")
    .optional(),
});

interface InsightsHandlerProps {
  logic: InsightsReadLogic;
}

/** The reads of the insight panels. */
export function createInsightsHandlers({ logic }: InsightsHandlerProps) {
  return new Hono<SessionEnvironment>().get(
    "/",
    validator("query", timeZoneQuery),
    async (context) => {
      const { ownerKey } = context.get("session");
      return context.json(
        await readInsights({
          logic,
          ownerKey,
          timeZone: context.req.valid("query").timezone,
        }),
        200,
      );
    },
  );
}
