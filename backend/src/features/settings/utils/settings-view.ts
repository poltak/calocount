import {
  parseNutrientGoalOverridesJson,
  resolveNutrientGoals,
} from "@app/common/features/entries/utils/nutrient-goals";
import type { SettingsRow } from "../storage/types.js";

/**
 * The settings as the old app sends them: the row without the owner key and
 * the columns that only the server reads, with the flags as booleans, and
 * with the nutrient goals resolved next to the owner's own overrides.
 */
export function serialiseSettings(row: SettingsRow) {
  const overrides = parseNutrientGoalOverridesJson(row.nutrientTargetsJson);
  return {
    id: row.id,
    timezone: row.timezone,
    dailyCalorieTarget: row.dailyCalorieTarget,
    dailyProteinTargetG: row.dailyProteinTargetG,
    proteinGoalMode: row.proteinGoalMode,
    dailyProteinTargetPerKg: row.dailyProteinTargetPerKg,
    vitaminB6UsFnbAdultUlEnabled: row.vitaminB6UsFnbAdultUlEnabled === 1,
    vitaminB6UsFnbAdultUlConfirmedAt: row.vitaminB6UsFnbAdultUlConfirmedAt,
    usFnbAdultUlEnabled: row.usFnbAdultUlEnabled === 1,
    usFnbAdultUlConfirmedAt: row.usFnbAdultUlConfirmedAt,
    partnerProfileEnabled: row.partnerProfileEnabled === 1,
    publicViewEnabled: row.publicViewEnabled === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    nutrientTargets: resolveNutrientGoals(overrides),
    nutrientTargetOverrides: overrides,
  };
}
