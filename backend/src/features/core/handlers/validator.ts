import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { AppError } from "../errors/app-error.js";
import { userMessage } from "./validation-messages.js";

/**
 * Validate request input and report failures through the shared error handler.
 * Each failed rule becomes one issue with the field's path and a message for
 * the user, which the frontend can show at that field.
 */
export function validator<
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(target: Target, schema: Schema) {
  return zValidator(
    target,
    schema,
    (result) => {
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
    },
    {
      // A message that the schema gives a rule wins over `userMessage`. The
      // cast is needed because the option's result type depends on the schema
      // type, which TypeScript cannot resolve while the schema is generic.
      validationFunction: (validated, value) =>
        validated.safeParseAsync(value, { error: userMessage }) as never,
    },
  );
}
