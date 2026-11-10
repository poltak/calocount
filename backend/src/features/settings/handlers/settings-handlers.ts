import { Hono } from "hono";
import { validator } from "../../core/handlers/validator.js";
import type { SessionEnvironment } from "../../entries/handlers/types.js";
import type { BackendLogic } from "../../core/types.js";
import type { SettingsRow } from "../storage/types.js";
import { serialiseSettings } from "../utils/settings-view.js";
import { settingsPatchSchema } from "./settings-schemas.js";

interface SettingsHandlerProps {
  logic: Pick<BackendLogic, "settings">;
}

/** The old app sends the profile and the partner switch next to the settings. */
function settingsBody(row: SettingsRow | undefined) {
  return {
    settings: row ? serialiseSettings(row) : null,
    profile: "owner" as const,
    partnerProfileEnabled: row?.partnerProfileEnabled === 1,
  };
}

/** The routes of `/api/settings`. */
export function createSettingsHandlers({ logic }: SettingsHandlerProps) {
  return new Hono<SessionEnvironment>()
    .get("/", async (context) => {
      const row = await logic.settings.read({
        ownerKey: context.get("session").ownerKey,
      });
      return context.json(settingsBody(row), 200);
    })
    .patch("/", validator("json", settingsPatchSchema), async (context) => {
      const row = await logic.settings.update({
        ownerKey: context.get("session").ownerKey,
        patch: context.req.valid("json"),
      });
      return context.json(settingsBody(row), 200);
    });
}
