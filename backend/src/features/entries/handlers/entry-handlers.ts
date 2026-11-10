import { Hono } from "hono";
import { routeBodyLimit } from "../../core/handlers/body-limit.js";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";
import { serialiseEntry } from "../utils/entry-rows.js";
import { MAX_MULTIPART_BYTES } from "../utils/meal-photo.js";
import { entryRequest } from "./entry-request.js";
import {
  copySchema,
  entryInputSchema,
  entryPatchSchema,
  idParamSchema,
} from "./entry-schemas.js";
import type { SessionEnvironment } from "./types.js";

interface EntryHandlerProps {
  logic: Pick<BackendLogic, "entries">;
}

/** The routes of `/api/meals`. The app calls a meal an entry. */
export function createEntryHandlers({ logic }: EntryHandlerProps) {
  return new Hono<SessionEnvironment>()
    .post(
      "/",
      routeBodyLimit(MAX_MULTIPART_BYTES),
      entryRequest(entryInputSchema),
      async (context) => {
        const entry = await logic.entries.create({
          ownerKey: context.get("session").ownerKey,
          input: context.req.valid("json"),
          photo: context.get("photo"),
        });
        return context.json({ meal: serialiseEntry(entry) }, 201);
      },
    )
    .patch(
      "/:id",
      validator("param", idParamSchema),
      routeBodyLimit(MAX_MULTIPART_BYTES),
      entryRequest(entryPatchSchema),
      async (context) => {
        const { entry, photoDeleted } = await logic.entries.update({
          ownerKey: context.get("session").ownerKey,
          id: context.req.valid("param").id,
          patch: context.req.valid("json"),
          photo: context.get("photo"),
        });
        return context.json(
          {
            meal: serialiseEntry(entry),
            ...(photoDeleted === undefined ? {} : { photoDeleted }),
          },
          200,
        );
      },
    )
    .delete("/:id", validator("param", idParamSchema), async (context) => {
      const { id } = context.req.valid("param");
      const { photoDeleted } = await logic.entries.remove({
        ownerKey: context.get("session").ownerKey,
        id,
      });
      return context.json(
        { deleted: true as const, mealId: id, photoDeleted },
        200,
      );
    })
    .post(
      "/:id/copy",
      validator("param", idParamSchema),
      validator("json", copySchema),
      async (context) => {
        const entry = await logic.entries.copy({
          ownerKey: context.get("session").ownerKey,
          id: context.req.valid("param").id,
          consumedAt: context.req.valid("json").consumedAt,
        });
        return context.json({ meal: serialiseEntry(entry) }, 201);
      },
    );
}
