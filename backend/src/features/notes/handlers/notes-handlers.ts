import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnvironment } from "../../auth/handlers/types.js";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";

const noteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000),
});

const noteParamsSchema = z.object({ noteId: z.uuid() });

interface NotesHandlerProps {
  logic: Pick<BackendLogic, "notes">;
}

/** Routes for the signed-in user's own notes. Mount them behind the session gate. */
export function createNotesHandlers({ logic }: NotesHandlerProps) {
  return new Hono<AuthEnvironment>()
    .get("/", async (context) => {
      const notes = await logic.notes.list({ user: context.get("auth").user });
      return context.json({ notes });
    })
    .post("/", validator("json", noteSchema), async (context) => {
      const note = await logic.notes.create({
        ...context.req.valid("json"),
        user: context.get("auth").user,
      });
      return context.json({ note }, 201);
    })
    .put(
      "/:noteId",
      validator("param", noteParamsSchema),
      validator("json", noteSchema),
      async (context) => {
        const note = await logic.notes.update({
          ...context.req.valid("json"),
          id: context.req.valid("param").noteId,
          user: context.get("auth").user,
        });
        return context.json({ note });
      },
    )
    .delete(
      "/:noteId",
      validator("param", noteParamsSchema),
      async (context) => {
        await logic.notes.delete({
          id: context.req.valid("param").noteId,
          user: context.get("auth").user,
        });
        return context.body(null, 204);
      },
    );
}
