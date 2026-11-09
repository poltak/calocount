import { Hono } from "hono";
import type { BackendLogic } from "../../core/types.js";

interface HealthHandlerProps {
  logic: Pick<BackendLogic, "health">;
}

/** Probes for hosts and monitors. They need no session. */
export function createHealthHandlers({ logic }: HealthHandlerProps) {
  return (
    new Hono()
      // Liveness: the process runs and answers requests.
      .get("/", (context) => context.json({ status: "ok" }))
      // Readiness: what every request depends on also answers.
      .get("/ready", async (context) => {
        await logic.health.checkReadiness();
        return context.json({ status: "ready" });
      })
  );
}
