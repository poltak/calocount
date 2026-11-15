import { isDateKey } from "@app/common/features/core/utils/logical-date";
import { Hono } from "hono";
import { z } from "zod";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";
import type { SessionEnvironment } from "../../entries/handlers/types.js";

const WEIGHT_RANGE_MESSAGE = "Enter a weight between 1 and 1,000 kg.";

const weightSchema = z.object({
  logicalDate: z
    .string()
    .refine(isDateKey, "The date must be a valid YYYY-MM-DD date."),
  weightKg: z
    .number(WEIGHT_RANGE_MESSAGE)
    .min(1, WEIGHT_RANGE_MESSAGE)
    .max(1_000, WEIGHT_RANGE_MESSAGE),
});

interface WeightHandlerProps {
  logic: Pick<BackendLogic, "weights">;
}

/** The route of `/api/weights`. */
export function createWeightHandlers({ logic }: WeightHandlerProps) {
  return new Hono<SessionEnvironment>().put(
    "/",
    validator("json", weightSchema),
    async (context) => {
      const weight = await logic.weights.save({
        ownerKey: context.get("session").ownerKey,
        ...context.req.valid("json"),
      });
      return context.json({ weight }, 200);
    },
  );
}
