import { getSettings, isValidTimeZone, upsertSettings, type SettingsPatch } from "../../../db/repository";
import {
  isNutrientKey,
  parseNutrientGoalOverridesJson,
  resolveNutrientGoals,
  type NutrientGoalOverrides,
} from "../../../domain/nutrient-goals";
import { NUTRIENT_META } from "../../../domain/nutrients";
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

function parseSettingsPatch(body: Record<string, unknown>): SettingsPatch {
  const patch: SettingsPatch = {};
  if (body.timezone !== undefined) {
    const timezone = requireString(body.timezone, "timezone", { max: 100 });
    if (!isValidTimeZone(timezone)) {
      throw new ApiError(400, "invalid_field", "timezone is not valid.");
    }
    patch.timezone = timezone;
  }
  if (body.dailyCalorieTarget !== undefined) patch.dailyCalorieTarget = body.dailyCalorieTarget == null ? null : Math.round(optionalNumber(body.dailyCalorieTarget, "dailyCalorieTarget", { min: 0, max: 100_000 }) ?? 0);
  if (body.dailyProteinTargetG !== undefined) patch.dailyProteinTargetG = body.dailyProteinTargetG == null ? null : optionalNumber(body.dailyProteinTargetG, "dailyProteinTargetG", { min: 0, max: 10_000 }) ?? 0;
  if (body.nutrientTargets !== undefined) {
    if (body.nutrientTargets === null) {
      patch.nutrientTargets = null;
    } else {
      if (!body.nutrientTargets || typeof body.nutrientTargets !== "object" || Array.isArray(body.nutrientTargets)) {
        throw new ApiError(400, "invalid_field", "nutrientTargets must be an object or null.");
      }
      const targets: NutrientGoalOverrides = {};
      for (const [key, value] of Object.entries(body.nutrientTargets)) {
        if (!isNutrientKey(key)) throw new ApiError(400, "invalid_field", `nutrientTargets.${key} is not supported.`);
        if (value === null) {
          targets[key] = null;
          continue;
        }
        const maximum = NUTRIENT_META.find((entry) => entry.key === key)?.maximum ?? 10_000_000;
        const target = optionalNumber(value, `nutrientTargets.${key}`, { min: Number.MIN_VALUE, max: maximum });
        if (target === undefined || target <= 0) {
          throw new ApiError(400, "invalid_field", `nutrientTargets.${key} must be greater than zero or null.`);
        }
        targets[key] = target;
      }
      patch.nutrientTargets = targets;
    }
  }
  if (body.photoRetentionDays !== undefined) patch.photoRetentionDays = Math.round(optionalNumber(body.photoRetentionDays, "photoRetentionDays", { min: 0, max: 3650 }) ?? 30);
  return patch;
}

function publicSettings(value: Awaited<ReturnType<typeof getSettings>>) {
  if (!value) return null;
  const {
    nutrientTargetsJson,
    telegramUserId: _telegramUserId,
    telegramChatId: _telegramChatId,
    activeAiProfileId: _activeAiProfileId,
    ...settings
  } = withoutOwnerKey(value);
  void _telegramUserId;
  void _telegramChatId;
  void _activeAiProfileId;
  const nutrientTargetOverrides = parseNutrientGoalOverridesJson(nutrientTargetsJson);
  return {
    ...settings,
    nutrientTargets: resolveNutrientGoals(nutrientTargetOverrides),
    nutrientTargetOverrides,
  };
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
    const patch = parseSettingsPatch(await parseJsonBody(request));
    const settings = await upsertSettings(getRequestDb(), identity.ownerKey, patch);
    return jsonResponse({ settings: publicSettings(settings) });
  });
}
