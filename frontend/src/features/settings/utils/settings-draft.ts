import {
  DEFAULT_CALORIE_TARGET,
  DEFAULT_PROTEIN_PER_KG,
  DEFAULT_PROTEIN_TARGET_G,
  PROTEIN_PER_KG_MAX,
  PROTEIN_PER_KG_MIN,
  isValidProteinPerKg,
  normaliseProteinGoalMode,
  type ProteinGoalMode,
} from "@app/common/features/goals/utils/daily-targets";
import {
  NUTRIENT_GOAL_DEFINITIONS,
  resolveNutrientGoals,
  type NutrientGoalMap,
  type NutrientGoalOverrides,
} from "@app/common/features/entries/utils/nutrient-goals";
import {
  NUTRIENT_KEYS,
  type NutrientKey,
} from "@app/common/features/entries/utils/nutrients";

export type NutrientGoalDraft = Record<NutrientKey, string>;

/** The values of the settings form. Each number is the text in its field. */
export interface SettingsDraft {
  calories: string;
  proteinG: string;
  proteinGoalMode: ProteinGoalMode;
  proteinPerKg: string;
  nutrients: NutrientGoalDraft;
  vitaminB6UsFnbAdultUlEnabled: boolean;
  usFnbAdultUlEnabled: boolean;
  timezone: string;
}

/** The part of the saved settings that the form reads. `null` when the owner saved nothing yet. */
export interface SavedSettings {
  timezone: string;
  dailyCalorieTarget: number | null;
  dailyProteinTargetG: number | null;
  proteinGoalMode: string;
  dailyProteinTargetPerKg: number | null;
  vitaminB6UsFnbAdultUlEnabled: boolean;
  usFnbAdultUlEnabled: boolean;
  nutrientTargets: NutrientGoalMap;
}

export function nutrientGoalDraftFromMap(
  goals: NutrientGoalMap = resolveNutrientGoals(),
): NutrientGoalDraft {
  return Object.fromEntries(
    NUTRIENT_KEYS.map((key) => {
      const { value } = goals[key];
      return [key, value === null ? "" : String(value)];
    }),
  ) as NutrientGoalDraft;
}

/**
 * Only the differences from the defaults are saved. A blank field turns off a
 * goal that has a default, and a blank field without a default stays off.
 */
function overridesFromDraft(draft: NutrientGoalDraft): NutrientGoalOverrides {
  const overrides: NutrientGoalOverrides = {};
  for (const key of NUTRIENT_KEYS) {
    const { defaultValue } = NUTRIENT_GOAL_DEFINITIONS[key];
    const text = draft[key].trim();
    if (text === "") {
      if (defaultValue !== null) {
        overrides[key] = null;
      }
    } else if (Number(text) !== defaultValue) {
      overrides[key] = Number(text);
    }
  }
  return overrides;
}

/** The form for settings that were never saved, and for the fields the owner did not set. */
export function settingsDraftOf({
  saved,
  deviceTimeZone,
}: {
  saved: SavedSettings | null;
  deviceTimeZone: string;
}): SettingsDraft {
  return {
    calories: String(saved?.dailyCalorieTarget ?? DEFAULT_CALORIE_TARGET),
    proteinG: String(saved?.dailyProteinTargetG ?? DEFAULT_PROTEIN_TARGET_G),
    proteinGoalMode: normaliseProteinGoalMode(saved?.proteinGoalMode),
    proteinPerKg: String(
      saved?.dailyProteinTargetPerKg ?? DEFAULT_PROTEIN_PER_KG,
    ),
    nutrients: nutrientGoalDraftFromMap(saved?.nutrientTargets),
    vitaminB6UsFnbAdultUlEnabled: saved?.vitaminB6UsFnbAdultUlEnabled ?? false,
    usFnbAdultUlEnabled: saved?.usFnbAdultUlEnabled ?? false,
    timezone: saved?.timezone ?? deviceTimeZone,
  };
}

/** The request body of a save, or the message that tells the owner which field to fix. */
export function patchOfDraft(
  draft: SettingsDraft,
): { patch: SettingsPatchBody } | { error: string } {
  const calories = Number(draft.calories);
  const proteinG = Number(draft.proteinG);
  const proteinPerKg = Number(draft.proteinPerKg);
  if (!Number.isFinite(calories) || calories < 1) {
    return { error: "Enter a calorie target greater than zero." };
  }
  if (
    draft.proteinGoalMode === "grams" &&
    (!Number.isFinite(proteinG) || proteinG < 1)
  ) {
    return { error: "Enter a fixed protein target greater than zero." };
  }
  if (
    draft.proteinGoalMode === "gramsPerKg" &&
    !isValidProteinPerKg(proteinPerKg)
  ) {
    return {
      error: `Enter a protein target between ${PROTEIN_PER_KG_MIN} and ${PROTEIN_PER_KG_MAX} g/kg.`,
    };
  }
  const invalidGoal = Object.values(draft.nutrients).some((value) => {
    if (value.trim() === "") {
      return false;
    }
    const parsed = Number(value);
    return !Number.isFinite(parsed) || parsed <= 0;
  });
  if (invalidGoal) {
    return {
      error: "Nutrition goals must be greater than zero or left blank.",
    };
  }
  return {
    patch: {
      timezone: draft.timezone,
      dailyCalorieTarget: calories,
      dailyProteinTargetG:
        Number.isFinite(proteinG) && proteinG > 0 ? proteinG : null,
      proteinGoalMode: draft.proteinGoalMode,
      dailyProteinTargetPerKg: isValidProteinPerKg(proteinPerKg)
        ? proteinPerKg
        : null,
      nutrientTargets: overridesFromDraft(draft.nutrients),
      vitaminB6UsFnbAdultUlEnabled: draft.vitaminB6UsFnbAdultUlEnabled,
      usFnbAdultUlEnabled: draft.usFnbAdultUlEnabled,
    },
  };
}

export interface SettingsPatchBody {
  timezone: string;
  dailyCalorieTarget: number;
  dailyProteinTargetG: number | null;
  proteinGoalMode: ProteinGoalMode;
  dailyProteinTargetPerKg: number | null;
  nutrientTargets: NutrientGoalOverrides;
  vitaminB6UsFnbAdultUlEnabled: boolean;
  usFnbAdultUlEnabled: boolean;
}

/** Every timezone the browser knows, plus the given ones in case it does not list them. */
export function timeZoneOptions(...always: string[]): string[] {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  return [...new Set(["UTC", ...always, ...supported])].toSorted(
    (left, right) => left.localeCompare(right),
  );
}
