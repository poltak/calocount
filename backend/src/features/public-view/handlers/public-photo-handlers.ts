import { Hono, type Context } from "hono";
import type { AppConfig, BackendLogic } from "../../core/types.js";
import {
  isPublicPhotoMimeType,
  isWithinPublicPhotoWindow,
} from "../utils/public-photo-policy.js";

interface PublicPhotoHandlerProps {
  logic: Pick<BackendLogic, "entries" | "entryReads" | "settings">;
  config: Pick<AppConfig, "ownerKey">;
}

const MEAL_ID = /^[A-Za-z0-9_-]{1,120}$/u;
const CACHE_CONTROL = "public, max-age=0, must-revalidate";

/** The body of the old app, which clients read. The private R2 key never appears in it. */
function notFound(context: Context) {
  return context.json(
    { error: { code: "not_found", message: "Photo not found." } },
    404,
    { "cache-control": "no-store" },
  );
}

/**
 * The photo of an entry that the public summary lists, at
 * `/meal-photos/<meal ID>`. The URL holds the entry ID, so the R2 key stays
 * private. Nothing is served while the public view is off, and only for the
 * complete entries of the owner in the last seven days, as the summary lists.
 */
export function createPublicPhotoHandlers({
  logic,
  config,
}: PublicPhotoHandlerProps) {
  return new Hono().get("/:id", async (context) => {
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
        { "cache-control": "no-store" },
      );
    }
    const id = context.req.param("id").trim();
    if (!MEAL_ID.test(id)) {
      return notFound(context);
    }
    const { enabled, timeZone } = await logic.settings.publicView({ ownerKey });
    if (!enabled) {
      return notFound(context);
    }
    const meal = await logic.entries.photoOfEntry({ ownerKey, id });
    if (
      !meal ||
      meal.status !== "complete" ||
      !meal.photoKey ||
      !isPublicPhotoMimeType(meal.photoMimeType)
    ) {
      return notFound(context);
    }
    const today = await logic.entryReads.today({ ownerKey, timeZone });
    if (
      !isWithinPublicPhotoWindow({
        consumedAt: meal.consumedAt,
        summaryDate: today.date,
        timeZone,
      })
    ) {
      return notFound(context);
    }
    let result;
    try {
      result = await logic.entries.readPhotoObject({
        photoKey: meal.photoKey,
        ifNoneMatch: context.req.header("if-none-match") ?? null,
      });
    } catch {
      // The object is gone, and a visitor learns no more than "not found".
      return notFound(context);
    }
    if (result.type === "notModified") {
      return new Response(null, {
        status: 304,
        headers: {
          "cache-control": CACHE_CONTROL,
          etag: result.etag,
          "x-content-type-options": "nosniff",
        },
      });
    }
    return new Response(result.object.body, {
      headers: {
        "cache-control": CACHE_CONTROL,
        "content-disposition": "inline",
        "content-length": String(result.object.size),
        "content-type": meal.photoMimeType,
        etag: result.object.httpEtag,
        "x-content-type-options": "nosniff",
      },
    });
  });
}
