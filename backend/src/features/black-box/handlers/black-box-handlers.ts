import { Hono } from "hono";
import type { BackendLogic } from "../../core/types.js";

interface BlackBoxHandlerProps {
  logic: Pick<BackendLogic, "blackBox">;
}

/**
 * Test-only routes. The HTTP app mounts them only when `config.blackBox` is
 * on. They need no session or origin, because the fixture of the black-box
 * tests calls them from outside any page.
 */
export function createBlackBoxHandlers({ logic }: BlackBoxHandlerProps) {
  return new Hono().post("/reset", async (context) => {
    await logic.blackBox.reset();
    return context.body(null, 204);
  });
}
