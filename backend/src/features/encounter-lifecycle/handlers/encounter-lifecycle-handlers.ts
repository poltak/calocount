import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { BackendLogic } from "../../../index.js";
import { EncounterLifecycleNotImplementedError } from "../logic/encounter-lifecycle-logic.js";

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
  const handlers = new Hono();

  handlers.onError((error, context) => {
    if (error instanceof EncounterLifecycleNotImplementedError) {
      return context.json(
        { error: { code: "NOT_IMPLEMENTED", message: error.message } },
        501,
      );
    }
    throw error;
  });

  handlers.post(
    "/:encounterId/start",
    zValidator("param", encounterParamsSchema),
    async (context) => {
      await logic.encounterLifecycle.start(context.req.valid("param"));
      return context.body(null, 204);
    },
  );

  handlers.post(
    "/:encounterId/pause",
    zValidator("param", encounterParamsSchema),
    async (context) => {
      await logic.encounterLifecycle.pause(context.req.valid("param"));
      return context.body(null, 204);
    },
  );

  handlers.post(
    "/:encounterId/stop",
    zValidator("param", encounterParamsSchema),
    async (context) => {
      await logic.encounterLifecycle.stop(context.req.valid("param"));
      return context.body(null, 204);
    },
  );

  return handlers;
}
