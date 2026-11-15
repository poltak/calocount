import type { AppConfig, BackendLogic } from "../../core/types.js";

interface PublicOwnerProps {
  logic: Pick<BackendLogic, "settings">;
  config: Pick<AppConfig, "ownerKey">;
}

export type PublicOwnerResult =
  | { ok: true; ownerKey: string; timeZone: string }
  | {
      ok: false;
      status: 503 | 404;
      body: { error: { code: string; message: string } };
    };

/**
 * The owner whose data the public view shows. The error bodies keep the codes
 * of the old app, which clients read.
 */
export async function resolvePublicOwner({
  logic,
  config,
}: PublicOwnerProps): Promise<PublicOwnerResult> {
  const ownerKey = config.ownerKey.trim();
  if (ownerKey === "") {
    return {
      ok: false,
      status: 503,
      body: {
        error: {
          code: "public_owner_key_missing",
          message: "The public dashboard is not configured.",
        },
      },
    };
  }
  const { enabled, timeZone } = await logic.settings.publicView({ ownerKey });
  if (!enabled) {
    return {
      ok: false,
      status: 404,
      body: {
        error: {
          code: "public_view_off",
          message: "The public dashboard is turned off.",
        },
      },
    };
  }
  return { ok: true, ownerKey, timeZone };
}
