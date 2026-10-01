import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { AppError } from "../errors/app-error.js";

/** Validate request input and report failures through the shared error handler. */
export function validator<
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(target: Target, schema: Schema) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new AppError({
        code: "INVALID_REQUEST",
        message: "The request is invalid",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      });
    }
  });
}
