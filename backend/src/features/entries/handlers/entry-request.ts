import { createMiddleware } from "hono/factory";
import type { z, ZodType } from "zod";
import { AppError } from "../../core/errors/app-error.js";
import { userMessage } from "../../core/handlers/validation-messages.js";
import { readEntryRequest } from "../utils/meal-photo.js";
import type { EntryRequestEnvironment } from "./types.js";

/**
 * Read the body of a request that creates or changes an entry, and check it
 * against `schema`. The body is JSON, or a multipart form with the entry and
 * a photo (see `readEntryRequest`). The checked entry is at
 * `context.req.valid("json")` as for `validator("json", …)`, and the photo is
 * at `context.get("photo")`.
 *
 * Put `routeBodyLimit` before it, because a photo is larger than the default
 * limit. The reader counts the bytes it reads, so that a body with a false
 * `Content-Length` stops at the same limit.
 *
 * The client types such a request as JSON. A client that sends a photo gives
 * the same entry as `json` for its type, and replaces the body with the form.
 */
export function entryRequest<Schema extends ZodType>(schema: Schema) {
  return createMiddleware<
    EntryRequestEnvironment,
    string,
    { in: { json: z.input<Schema> }; out: { json: z.output<Schema> } }
  >(async (context, next) => {
    const { body, photo } = await readEntryRequest(context.req.raw);
    const result = await schema.safeParseAsync(body, { error: userMessage });
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
    context.req.addValidatedData(
      "json",
      result.data as Record<string, unknown>,
    );
    context.set("photo", photo);
    await next();
  });
}
