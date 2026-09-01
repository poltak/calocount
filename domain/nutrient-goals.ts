import { NUTRIENT_KEYS, type NutrientKey } from "./nutrients";

export type NutrientGoalDirection = "minimum" | "maximum";

export type NutrientGoalDefinition = {
  readonly defaultValue: number | null;
  readonly direction: NutrientGoalDirection;
  readonly reference: "FDA Daily Value" | "FDA adult caffeine guidance" | "No general daily value";
};

export type NutrientGoalOverrides = Partial<Record<NutrientKey, number | null>>;

export type ResolvedNutrientGoal = {
  readonly value: number | null;
  readonly direction: NutrientGoalDirection;
  readonly source: "default" | "custom" | "disabled";
};

export type NutrientGoalMap = Record<NutrientKey, ResolvedNutrientGoal>;

/**
 * General adult defaults use current FDA Daily Values. These are useful
 * reference amounts, not personalised medical advice. A null value means that
 * no general daily value fits the nutrient stored by Calocount.
 */
export const NUTRIENT_GOAL_DEFINITIONS = {
  fiberG: { defaultValue: 28, direction: "minimum", reference: "FDA Daily Value" },
  totalSugarsG: { defaultValue: null, direction: "maximum", reference: "No general daily value" },
  saturatedFatG: { defaultValue: 20, direction: "maximum", reference: "FDA Daily Value" },
  monounsaturatedFatG: { defaultValue: null, direction: "minimum", reference: "No general daily value" },
  polyunsaturatedFatG: { defaultValue: null, direction: "minimum", reference: "No general daily value" },
  omega3G: { defaultValue: null, direction: "minimum", reference: "No general daily value" },
  cholesterolMg: { defaultValue: 300, direction: "maximum", reference: "FDA Daily Value" },
  vitaminAMcgRae: { defaultValue: 900, direction: "minimum", reference: "FDA Daily Value" },
  vitaminCMg: { defaultValue: 90, direction: "minimum", reference: "FDA Daily Value" },
  vitaminDMcg: { defaultValue: 20, direction: "minimum", reference: "FDA Daily Value" },
  vitaminEMg: { defaultValue: 15, direction: "minimum", reference: "FDA Daily Value" },
  vitaminKMcg: { defaultValue: 120, direction: "minimum", reference: "FDA Daily Value" },
  vitaminB6Mg: { defaultValue: 1.7, direction: "minimum", reference: "FDA Daily Value" },
  folateMcgDfe: { defaultValue: 400, direction: "minimum", reference: "FDA Daily Value" },
  vitaminB12Mcg: { defaultValue: 2.4, direction: "minimum", reference: "FDA Daily Value" },
  sodiumMg: { defaultValue: 2_300, direction: "maximum", reference: "FDA Daily Value" },
  potassiumMg: { defaultValue: 4_700, direction: "minimum", reference: "FDA Daily Value" },
  calciumMg: { defaultValue: 1_300, direction: "minimum", reference: "FDA Daily Value" },
  ironMg: { defaultValue: 18, direction: "minimum", reference: "FDA Daily Value" },
  magnesiumMg: { defaultValue: 420, direction: "minimum", reference: "FDA Daily Value" },
  phosphorusMg: { defaultValue: 1_250, direction: "minimum", reference: "FDA Daily Value" },
  zincMg: { defaultValue: 11, direction: "minimum", reference: "FDA Daily Value" },
  seleniumMcg: { defaultValue: 55, direction: "minimum", reference: "FDA Daily Value" },
  caffeineMg: { defaultValue: 400, direction: "maximum", reference: "FDA adult caffeine guidance" },
} as const satisfies Record<NutrientKey, NutrientGoalDefinition>;

export function isNutrientKey(value: string): value is NutrientKey {
  return (NUTRIENT_KEYS as readonly string[]).includes(value);
}

export function parseNutrientGoalOverridesJson(value: string | null | undefined): NutrientGoalOverrides {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const overrides: NutrientGoalOverrides = {};
    for (const [key, target] of Object.entries(parsed)) {
      if (!isNutrientKey(key)) continue;
      if (target === null) overrides[key] = null;
      else if (typeof target === "number" && Number.isFinite(target) && target > 0) overrides[key] = target;
    }
    return overrides;
  } catch {
    return {};
  }
}

export function resolveNutrientGoals(overrides: NutrientGoalOverrides = {}): NutrientGoalMap {
  const goals = {} as NutrientGoalMap;
  for (const key of NUTRIENT_KEYS) {
    const definition = NUTRIENT_GOAL_DEFINITIONS[key];
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const value = overrides[key];
      goals[key] = {
        value: typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null,
        direction: definition.direction,
        source: value === null ? "disabled" : "custom",
      };
    } else {
      goals[key] = {
        value: definition.defaultValue,
        direction: definition.direction,
        source: "default",
      };
    }
  }
  return goals;
}
