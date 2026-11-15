import { Hono } from "hono";
import { AppError } from "../../core/errors/app-error.js";
import type { AppConfig, BackendLogic } from "../../core/types.js";
import { LLMS_GUIDE } from "../utils/llms-guide.js";

interface LlmsHandlerProps {
  logic: Pick<BackendLogic, "settings">;
  config: Pick<AppConfig, "ownerKey">;
}

/** The guide for agents exists only while the owner shows the public view. */
export function createLlmsHandlers({ logic, config }: LlmsHandlerProps) {
  return new Hono().get("/", async (context) => {
    const ownerKey = config.ownerKey.trim();
    const enabled =
      ownerKey !== "" &&
      (await logic.settings.publicView({ ownerKey })).enabled;
    if (!enabled) {
      throw new AppError({ code: "NOT_FOUND", message: "Not found" });
    }
    context.header("cache-control", "no-store");
    return context.text(LLMS_GUIDE, 200);
  });
}
