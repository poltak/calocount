import type { Profile } from "@app/common/features/core/utils/profile";
import { Hono } from "hono";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";
import { AppError } from "../../core/errors/app-error.js";
import type { ProfileEnvironment } from "../../core/handlers/types.js";
import type { SettingsRow } from "../storage/types.js";
import { serialiseSettings } from "../utils/settings-view.js";
import { settingsPatchSchema } from "./settings-schemas.js";

interface SettingsHandlerProps {
  logic: Pick<BackendLogic, "settings">;
}

/** The old app sends the profile and the partner switch next to the settings. */
function settingsBody({
  row,
  profile,
  partnerProfileEnabled,
}: {
  row: SettingsRow | undefined;
  profile: Profile;
  partnerProfileEnabled: boolean;
}) {
  return {
    settings: row ? serialiseSettings(row) : null,
    profile,
    partnerProfileEnabled,
  };
}

/** The routes of `/api/settings`. */
export function createSettingsHandlers({ logic }: SettingsHandlerProps) {
  return new Hono<ProfileEnvironment>()
    .get("/", async (context) => {
      const profile = context.get("profile");
      const row = await logic.settings.read({
        ownerKey: context.get("session").ownerKey,
      });
      return context.json(
        settingsBody({
          row,
          profile,
          partnerProfileEnabled: await logic.settings.partnerProfileEnabled({
            accountKey: context.get("accountKey"),
          }),
        }),
        200,
      );
    })
    .patch("/", validator("json", settingsPatchSchema), async (context) => {
      const profile = context.get("profile");
      const patch = context.req.valid("json");
      // The public view and the partner switch belong to the owner's log.
      if (
        profile !== "owner" &&
        (patch.publicViewEnabled !== undefined ||
          patch.partnerProfileEnabled !== undefined)
      ) {
        throw new AppError({
          code: "INVALID_REQUEST",
          message:
            "publicViewEnabled and partnerProfileEnabled can only change on the owner profile.",
        });
      }
      const row = await logic.settings.update({
        ownerKey: context.get("session").ownerKey,
        patch,
      });
      return context.json(
        settingsBody({
          row,
          profile,
          partnerProfileEnabled: await logic.settings.partnerProfileEnabled({
            accountKey: context.get("accountKey"),
          }),
        }),
        200,
      );
    });
}
