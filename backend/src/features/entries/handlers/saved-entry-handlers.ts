import { Hono } from "hono";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";
import { serialiseEntry } from "../utils/entry-rows.js";
import {
  copySchema,
  idParamSchema,
  savedEntryInputSchema,
} from "./entry-schemas.js";
import type { SessionEnvironment } from "./types.js";

interface SavedEntryHandlerProps {
  logic: Pick<BackendLogic, "savedEntries">;
}

/** The routes of `/api/saved-entries`. */
export function createSavedEntryHandlers({ logic }: SavedEntryHandlerProps) {
  return new Hono<SessionEnvironment>()
    .get("/", async (context) =>
      context.json(
        {
          entries: await logic.savedEntries.list({
            ownerKey: context.get("session").ownerKey,
          }),
        },
        200,
      ),
    )
    .post("/", validator("json", savedEntryInputSchema), async (context) =>
      context.json(
        {
          entry: await logic.savedEntries.save({
            ownerKey: context.get("session").ownerKey,
            sourceEntryId: context.req.valid("json").sourceEntryId,
          }),
        },
        201,
      ),
    )
    .delete("/:id", validator("param", idParamSchema), async (context) => {
      const { id } = context.req.valid("param");
      await logic.savedEntries.remove({
        ownerKey: context.get("session").ownerKey,
        id,
      });
      return context.json({ deleted: true as const, entryId: id }, 200);
    })
    .post(
      "/:id/track",
      validator("param", idParamSchema),
      validator("json", copySchema),
      async (context) => {
        const entry = await logic.savedEntries.track({
          ownerKey: context.get("session").ownerKey,
          id: context.req.valid("param").id,
          consumedAt: context.req.valid("json").consumedAt,
        });
        return context.json({ entry: serialiseEntry(entry) }, 201);
      },
    );
}
