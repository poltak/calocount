import { Hono } from "hono";
import { z } from "zod";
import type { BackendLogic } from "../../../index.js";
import { validator } from "../../core/handlers/validator.js";

const encounterParamsSchema = z.object({
  // Temporary ID validation; see docs/agents/initial-setup-todos.md.
  encounterId: z.string().trim().min(1),
});

interface EncounterLifecycleHandlerProps {
  logic: Pick<BackendLogic, "encounterLifecycle">;
}

export function createEncounterLifecycleHandlers({
  logic,
}: EncounterLifecycleHandlerProps) {
  return new Hono()
    .post(
      "/:encounterId/start",
      validator("param", encounterParamsSchema),
      async (context) => {
        await logic.encounterLifecycle.start(context.req.valid("param"));
        return context.body(null, 204);
      },
    )
    .post(
      "/:encounterId/pause",
      validator("param", encounterParamsSchema),
      async (context) => {
        await logic.encounterLifecycle.pause(context.req.valid("param"));
        return context.body(null, 204);
      },
    )
    .post(
      "/:encounterId/stop",
      validator("param", encounterParamsSchema),
      async (context) => {
        await logic.encounterLifecycle.stop(context.req.valid("param"));
        return context.body(null, 204);
      },
    );
}
