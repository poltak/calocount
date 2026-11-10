import { zValidator } from "@hono/zod-validator";
import {
  isDateKey,
  isMonthKey,
} from "@app/common/features/core/utils/logical-date";
import { Hono } from "hono";
import { z } from "zod";
import type { AppConfig } from "../../core/types.js";
import {
  readDaily,
  readDay,
  readMonth,
  type PublicLogic,
} from "./public-reads.js";

const VIEWS_MESSAGE = "view must be one of: daily, month, day.";

/** The views share one path, because Cloudflare Access can make only one exact path public. */
const publicSummaryQuery = z.discriminatedUnion("view", [
  z.object({ view: z.literal("daily") }),
  z.object({
    view: z.literal("month"),
    month: z
      .string()
      .refine(isMonthKey, "month must be a valid YYYY-MM month."),
  }),
  z.object({
    view: z.literal("day"),
    date: z.string().refine(isDateKey, "date must be a valid YYYY-MM-DD date."),
  }),
]);

interface PublicSummaryHandlerProps {
  logic: PublicLogic;
  config: Pick<AppConfig, "ownerKey">;
}

/**
 * The public JSON for the one configured owner. The routes need no session,
 * and they answer only while the owner keeps the public view on. The error
 * bodies keep the codes of the old app, which clients read.
 */
export function createPublicSummaryHandlers({
  logic,
  config,
}: PublicSummaryHandlerProps) {
  return new Hono().get(
    "/summary",
    zValidator("query", publicSummaryQuery, (result, context) => {
      if (!result.success) {
        const [issue] = result.error.issues;
        const message =
          issue === undefined || issue.path[0] === "view"
            ? VIEWS_MESSAGE
            : issue.message;
        return context.json({ error: { code: "invalid_query", message } }, 400);
      }
      return undefined;
    }),
    async (context) => {
      context.header("cache-control", "no-store");
      const ownerKey = config.ownerKey.trim();
      if (ownerKey === "") {
        return context.json(
          {
            error: {
              code: "public_owner_key_missing",
              message: "The public dashboard is not configured.",
            },
          },
          503,
        );
      }
      const { enabled, timeZone } = await logic.settings.publicView({
        ownerKey,
      });
      if (!enabled) {
        return context.json(
          {
            error: {
              code: "public_view_off",
              message: "The public dashboard is turned off.",
            },
          },
          404,
        );
      }
      const query = context.req.valid("query");
      const read = { logic, ownerKey, timeZone };
      switch (query.view) {
        case "daily":
          return context.json(await readDaily(read), 200);
        case "month":
          return context.json(
            await readMonth({ ...read, month: query.month }),
            200,
          );
        case "day":
          return context.json(
            await readDay({ ...read, date: query.date }),
            200,
          );
      }
    },
  );
}
