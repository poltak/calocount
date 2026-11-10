import {
  parseProfile,
  profileDataKey,
} from "@app/common/features/core/utils/profile";
import { createMiddleware } from "hono/factory";
import { AppError } from "../../core/errors/app-error.js";
import type { ProfileEnvironment } from "../../core/handlers/types.js";
import type { BackendLogic } from "../../core/types.js";

/**
 * Point the session at the data of the profile that the request names in its
 * `profile` query. Sign-in data stays under `accountKey`. The partner profile
 * answers only while the owner has it on. Put it after `requireSession`.
 */
export function resolveProfile({
  logic,
}: {
  logic: Pick<BackendLogic, "settings">;
}) {
  return createMiddleware<ProfileEnvironment>(async (context, next) => {
    const profile = parseProfile(context.req.query("profile") ?? null);
    if (!profile) {
      throw new AppError({
        code: "INVALID_REQUEST",
        message: "profile must be owner or partner.",
      });
    }
    const session = context.get("session");
    const accountKey = session.ownerKey;
    if (profile === "partner") {
      if (!(await logic.settings.partnerProfileEnabled({ accountKey }))) {
        throw new AppError({
          code: "NOT_FOUND",
          message: "The partner profile is off.",
        });
      }
    }
    context.set("accountKey", accountKey);
    context.set("profile", profile);
    context.set("session", {
      ...session,
      ownerKey: profileDataKey({ accountKey, profile }),
    });
    await next();
  });
}
