import { getAiProfile, getSettings, upsertSettings, type SettingsPatch } from "../../../db/repository";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  optionalNumber,
  parseJsonBody,
  requireApiIdentity,
  requireString,
  withApiErrors,
} from "../_lib/http";
import { withoutOwnerKey } from "../_lib/serialise";

function parsePatch(body: Record<string, unknown>): SettingsPatch {
  const patch: SettingsPatch = {};
  if (body.telegramUserId !== undefined) patch.telegramUserId = body.telegramUserId == null ? null : requireString(body.telegramUserId, "telegramUserId", { max: 100 }) ?? null;
  if (body.telegramChatId !== undefined) patch.telegramChatId = body.telegramChatId == null ? null : requireString(body.telegramChatId, "telegramChatId", { max: 100 }) ?? null;
  if (body.timezone !== undefined) {
    const timezone = requireString(body.timezone, "timezone", { max: 100 });
    if (timezone && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(timezone) && timezone !== "UTC") {
      throw new ApiError(400, "invalid_field", "timezone is not valid.");
    }
    patch.timezone = timezone;
  }
  if (body.dailyCalorieTarget !== undefined) patch.dailyCalorieTarget = body.dailyCalorieTarget == null ? null : Math.round(optionalNumber(body.dailyCalorieTarget, "dailyCalorieTarget", { min: 0, max: 100_000 }) ?? 0);
  if (body.dailyProteinTargetG !== undefined) patch.dailyProteinTargetG = body.dailyProteinTargetG == null ? null : optionalNumber(body.dailyProteinTargetG, "dailyProteinTargetG", { min: 0, max: 10_000 }) ?? 0;
  if (body.activeAiProfileId !== undefined) patch.activeAiProfileId = body.activeAiProfileId == null ? null : requireString(body.activeAiProfileId, "activeAiProfileId", { max: 120 }) ?? null;
  if (body.photoRetentionDays !== undefined) patch.photoRetentionDays = Math.round(optionalNumber(body.photoRetentionDays, "photoRetentionDays", { min: 0, max: 3650 }) ?? 30);
  return patch;
}

function publicSettings(value: Awaited<ReturnType<typeof getSettings>>) {
  if (!value) return null;
  return withoutOwnerKey(value);
}

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const settings = await getSettings(getRequestDb(), identity.ownerKey);
    return jsonResponse({ settings: publicSettings(settings) });
  });
}

export async function PATCH(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const patch = parsePatch(await parseJsonBody(request));
    const db = getRequestDb();
    if (patch.activeAiProfileId) {
      const profile = await getAiProfile(db, identity.ownerKey, patch.activeAiProfileId);
      if (!profile) throw new ApiError(400, "invalid_profile", "activeAiProfileId does not belong to this account.");
    }
    const settings = await upsertSettings(db, identity.ownerKey, patch);
    return jsonResponse({ settings: publicSettings(settings) });
  });
}
