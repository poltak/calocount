import { NUTRIENT_KEYS, type NutrientKey } from "./nutrients.js";

export type NutrientGoalDirection = "minimum" | "maximum";

interface NutrientGoalDefinition {
  readonly defaultValue: number | null;
  readonly direction: NutrientGoalDirection;
}

/** A custom value, or `null` for a goal that the owner turned off. A key that is absent has its default. */
export type NutrientGoalOverrides = Partial<Record<NutrientKey, number | null>>;

export interface ResolvedNutrientGoal {
  readonly value: number | null;
  readonly direction: NutrientGoalDirection;
  readonly source: "default" | "custom" | "disabled";
}

export type NutrientGoalMap = Record<NutrientKey, ResolvedNutrientGoal>;

/**
 * General adult defaults, from the FDA Daily Values and the FDA caffeine
 * guidance. They are reference amounts, not personal medical advice. A `null`
 * default means that no general daily value fits the nutrient.
 */
export const NUTRIENT_GOAL_DEFINITIONS = {
  fiberG: { defaultValue: 28, direction: "minimum" },
  totalSugarsG: { defaultValue: null, direction: "maximum" },
  saturatedFatG: { defaultValue: 20, direction: "maximum" },
  monounsaturatedFatG: { defaultValue: null, direction: "minimum" },
  polyunsaturatedFatG: { defaultValue: null, direction: "minimum" },
  omega3G: { defaultValue: null, direction: "minimum" },
  cholesterolMg: { defaultValue: 300, direction: "maximum" },
  vitaminAMcgRae: { defaultValue: 900, direction: "minimum" },
  vitaminCMg: { defaultValue: 90, direction: "minimum" },
  vitaminDMcg: { defaultValue: 20, direction: "minimum" },
  vitaminEMg: { defaultValue: 15, direction: "minimum" },
  vitaminKMcg: { defaultValue: 120, direction: "minimum" },
  vitaminB6Mg: { defaultValue: 1.7, direction: "minimum" },
  folateMcgDfe: { defaultValue: 400, direction: "minimum" },
  vitaminB12Mcg: { defaultValue: 2.4, direction: "minimum" },
  sodiumMg: { defaultValue: 2_300, direction: "maximum" },
  potassiumMg: { defaultValue: 4_700, direction: "minimum" },
  calciumMg: { defaultValue: 1_300, direction: "minimum" },
  ironMg: { defaultValue: 18, direction: "minimum" },
  magnesiumMg: { defaultValue: 420, direction: "minimum" },
  phosphorusMg: { defaultValue: 1_250, direction: "minimum" },
  zincMg: { defaultValue: 11, direction: "minimum" },
  seleniumMcg: { defaultValue: 55, direction: "minimum" },
  caffeineMg: { defaultValue: 400, direction: "maximum" },
} as const satisfies Record<NutrientKey, NutrientGoalDefinition>;

export function isNutrientKey(value: string): value is NutrientKey {
  return (NUTRIENT_KEYS as readonly string[]).includes(value);
}

/** Damaged text gives no overrides, so the defaults apply. */
export function parseNutrientGoalOverridesJson(
  value: string | null | undefined,
): NutrientGoalOverrides {
  if (!value) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const overrides: NutrientGoalOverrides = {};
    for (const [key, target] of Object.entries(parsed)) {
      if (!isNutrientKey(key)) {
        continue;
      }
      if (target === null) {
        overrides[key] = null;
      } else if (
        typeof target === "number" &&
        Number.isFinite(target) &&
        target > 0
      ) {
        overrides[key] = target;
      }
    }
    return overrides;
  } catch {
    return {};
  }
}

export function resolveNutrientGoals(
  overrides: NutrientGoalOverrides = {},
): NutrientGoalMap {
  return Object.fromEntries(
    NUTRIENT_KEYS.map((key) => {
      const { defaultValue, direction } = NUTRIENT_GOAL_DEFINITIONS[key];
      if (!Object.hasOwn(overrides, key)) {
        return [key, { value: defaultValue, direction, source: "default" }];
      }
      const value = overrides[key];
      return [
        key,
        {
          value:
            typeof value === "number" && Number.isFinite(value) && value > 0
              ? value
              : null,
          direction,
          source: value === null ? "disabled" : "custom",
        },
      ];
    }),
  ) as NutrientGoalMap;
}

/**
 * How a goal reads: an amount to reach, a limit to stay under, or a reference
 * amount that carries no judgement. A maximum is a limit only when it is the
 * owner's own value or a published reduction guideline. Another default
 * maximum, such as the Daily Value of cholesterol, is a reference.
 */
export type NutrientGoalKind = "goal" | "limit" | "reference";

const GUIDELINE_MAXIMUMS: ReadonlySet<NutrientKey> = new Set([
  "sodiumMg",
  "saturatedFatG",
  "caffeineMg",
]);

export function nutrientGoalKind(
  key: NutrientKey,
  goal: ResolvedNutrientGoal | null | undefined,
): NutrientGoalKind | null {
  if (!goal || goal.value === null || goal.value <= 0) {
    return null;
  }
  if (goal.direction === "minimum") {
    return "goal";
  }
  return goal.source === "custom" || GUIDELINE_MAXIMUMS.has(key)
    ? "limit"
    : "reference";
}

export function goalKindWord(kind: NutrientGoalKind | null): string {
  return kind === "limit"
    ? "limit"
    : kind === "reference"
      ? "reference"
      : "goal";
}

export interface NutrientGoalProgress {
  displayPercent: number;
  fillPercent: number;
  status:
    "complete" | "progress" | "reference" | "exceeded" | "warning" | "within";
}

/** Progress toward a goal. A reference amount gets a neutral status at any level. */
export function nutrientGoalProgress({
  amount,
  goal,
  kind,
}: {
  amount: number | null | undefined;
  goal: ResolvedNutrientGoal | null | undefined;
  kind: NutrientGoalKind | null;
}): NutrientGoalProgress | null {
  if (
    amount === null ||
    amount === undefined ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    !goal ||
    goal.value === null ||
    goal.value <= 0
  ) {
    return null;
  }
  const rawPercent = (amount / goal.value) * 100;
  const status =
    goal.direction === "minimum"
      ? rawPercent >= 100
        ? "complete"
        : "progress"
      : kind === "reference"
        ? "reference"
        : rawPercent > 100
          ? "exceeded"
          : rawPercent >= 75
            ? "warning"
            : "within";
  return {
    displayPercent: Math.round(rawPercent),
    fillPercent: Math.min(100, Math.max(0, rawPercent)),
    status,
  };
}
