import { Hono } from "hono";
import { createEncounterLifecycleHandlers } from "../features/encounter-lifecycle/handlers/encounter-lifecycle-handlers.js";
import type { App } from "../index.js";

interface HttpAppProps {
  app: Pick<App, "logic">;
}

/** Register HTTP handlers against an existing business App. */
export function createHttpApp({ app }: HttpAppProps) {
  return new Hono().route(
    "/encounters",
    createEncounterLifecycleHandlers({ logic: app.logic }),
  );
}
