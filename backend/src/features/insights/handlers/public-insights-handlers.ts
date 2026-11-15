import { Hono } from "hono";
import type { PublicViewEnvironment } from "../../core/handlers/types.js";
import { validator } from "../../core/handlers/validator.js";
import { publicInsightsOf } from "../utils/public-insights.js";
import { timeZoneQuery } from "./insights-handlers.js";
import { readInsights, type InsightsReadLogic } from "./insights-read.js";

interface PublicInsightsHandlerProps {
  logic: InsightsReadLogic;
}

/** The public mirror of the insight read. The `timezone` query is accepted and not read. */
export function createPublicInsightsHandlers({
  logic,
}: PublicInsightsHandlerProps) {
  return new Hono<PublicViewEnvironment>().get(
    "/",
    validator("query", timeZoneQuery),
    async (context) => {
      const { ownerKey, timeZone } = context.get("publicOwner");
      return context.json(
        publicInsightsOf(await readInsights({ logic, ownerKey, timeZone })),
        200,
      );
    },
  );
}
