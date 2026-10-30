import { getSettings, upsertSettings, type SettingsPatch } from "../../../db/repository";
import { isValidTimeZone } from "../../../domain/logical-date";
import {
  isNutrientKey,
  parseNutrientGoalOverridesJson,
  resolveNutrientGoals,
  type NutrientGoalOverrides,
} from "../../../domain/nutrient-goals";
import {
  isProteinGoalMode,
  PROTEIN_PER_KG_MAX,
  PROTEIN_PER_KG_MIN,
} from "../../../domain/protein-goals";
import { NUTRIENT_META } from "../../../domain/nutrients";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  optionalNumber,
  parseJsonBody,
  readPartnerProfileEnabled,
  requireApiIdentity,
  type ApiIdentity,
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
  if (body.proteinGoalMode !== undefined) {
    const proteinGoalMode = requireString(body.proteinGoalMode, "proteinGoalMode", { max: 20 });
    if (!isProteinGoalMode(proteinGoalMode)) {
      throw new ApiError(400, "invalid_field", "proteinGoalMode must be grams or gramsPerKg.");
    }
    patch.proteinGoalMode = proteinGoalMode;
  }
  if (body.dailyProteinTargetPerKg !== undefined) {
    if (body.dailyProteinTargetPerKg === null) {
      patch.dailyProteinTargetPerKg = null;
    } else {
      patch.dailyProteinTargetPerKg = optionalNumber(body.dailyProteinTargetPerKg, "dailyProteinTargetPerKg", {
        min: PROTEIN_PER_KG_MIN,
        max: PROTEIN_PER_KG_MAX,
      }) ?? null;
    }
  }
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
  if (body.vitaminB6UsFnbAdultUlEnabled !== undefined) {
    if (typeof body.vitaminB6UsFnbAdultUlEnabled !== "boolean") {
      throw new ApiError(400, "invalid_field", "vitaminB6UsFnbAdultUlEnabled must be a boolean.");
    }
    patch.vitaminB6UsFnbAdultUlEnabled = body.vitaminB6UsFnbAdultUlEnabled;
  }
  if (body.usFnbAdultUlEnabled !== undefined) {
    if (typeof body.usFnbAdultUlEnabled !== "boolean") {
      throw new ApiError(400, "invalid_field", "usFnbAdultUlEnabled must be a boolean.");
    }
    patch.usFnbAdultUlEnabled = body.usFnbAdultUlEnabled;
  }
  if (body.partnerProfileEnabled !== undefined) {
    if (typeof body.partnerProfileEnabled !== "boolean") {
      throw new ApiError(400, "invalid_field", "partnerProfileEnabled must be a boolean.");
    }
    patch.partnerProfileEnabled = body.partnerProfileEnabled;
  }
  if (body.publicViewEnabled !== undefined) {
    if (typeof body.publicViewEnabled !== "boolean") {
      throw new ApiError(400, "invalid_field", "publicViewEnabled must be a boolean.");
    }
    patch.publicViewEnabled = body.publicViewEnabled;
  }
  return patch;
}

function publicSettings(value: Awaited<ReturnType<typeof getSettings>>) {
  if (!value) return null;
  const {
    nutrientTargetsJson,
    activeAiProfileId: _activeAiProfileId,
    photoRetentionDays: _photoRetentionDays,
    ...settings
  } = withoutOwnerKey(value);
  void _activeAiProfileId;
  void _photoRetentionDays;
  const nutrientTargetOverrides = parseNutrientGoalOverridesJson(nutrientTargetsJson);
  return {
    ...settings,
    nutrientTargets: resolveNutrientGoals(nutrientTargetOverrides),
    nutrientTargetOverrides,
  };
}

/** The settings of the profile, with the profile and the owner's partner switch. */
async function settingsResponse(identity: ApiIdentity, settings: Awaited<ReturnType<typeof getSettings>>): Promise<Response> {
  const partnerProfileEnabled = identity.profile === "owner"
    ? settings?.partnerProfileEnabled === true
    : await readPartnerProfileEnabled(identity.accountKey);
  return jsonResponse({ settings: publicSettings(settings), profile: identity.profile, partnerProfileEnabled });
}

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    return settingsResponse(identity, await getSettings(getRequestDb(), identity.ownerKey));
  });
}

export async function PATCH(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const patch = parseSettingsPatch(await parseJsonBody(request));
    // The public view and the partner switch belong to the owner's log.
    if (identity.profile !== "owner") {
      for (const field of ["publicViewEnabled", "partnerProfileEnabled"] as const) {
        if (patch[field] !== undefined) throw new ApiError(400, "owner_only_setting", `${field} can only change on the owner profile.`);
      }
    }
    return settingsResponse(identity, await upsertSettings(getRequestDb(), identity.ownerKey, patch));
  });
}
