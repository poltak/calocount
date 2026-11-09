import { Hono } from "hono";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";
import { serialiseEntry } from "../utils/entry-rows.js";
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
    .post("/", validator("json", entryInputSchema), async (context) => {
      const entry = await logic.entries.create({
        ownerKey: context.get("session").ownerKey,
        input: context.req.valid("json"),
      });
      return context.json({ meal: serialiseEntry(entry) }, 201);
    })
    .patch(
      "/:id",
      validator("param", idParamSchema),
      validator("json", entryPatchSchema),
      async (context) => {
        const entry = await logic.entries.update({
          ownerKey: context.get("session").ownerKey,
          id: context.req.valid("param").id,
          patch: context.req.valid("json"),
        });
        return context.json({ meal: serialiseEntry(entry) }, 200);
      },
    )
    .delete("/:id", validator("param", idParamSchema), async (context) => {
      const { id } = context.req.valid("param");
      await logic.entries.remove({
        ownerKey: context.get("session").ownerKey,
        id,
      });
      return context.json({ deleted: true as const, mealId: id }, 200);
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
