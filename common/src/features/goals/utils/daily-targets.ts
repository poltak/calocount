/** What the dashboard shows for an owner who set no goal yet. */
export const DEFAULT_CALORIE_TARGET = 2400;
export const DEFAULT_PROTEIN_TARGET_G = 160;

export const PROTEIN_GOAL_MODES = ["grams", "gramsPerKg"] as const;
export type ProteinGoalMode = (typeof PROTEIN_GOAL_MODES)[number];

export const PROTEIN_PER_KG_MIN = 0.8;
export const PROTEIN_PER_KG_MAX = 3;
export const PROTEIN_PER_KG_STEP = 0.1;
export const DEFAULT_PROTEIN_PER_KG = 1.6;

export function isProteinGoalMode(value: unknown): value is ProteinGoalMode {
  return value === "grams" || value === "gramsPerKg";
}

/** A stored value that is not a mode counts as the fixed mode, as the old app reads it. */
export function normaliseProteinGoalMode(value: unknown): ProteinGoalMode {
  return isProteinGoalMode(value) ? value : "grams";
}

export function isValidProteinPerKg(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= PROTEIN_PER_KG_MIN &&
    value <= PROTEIN_PER_KG_MAX
  );
}

/** The weight that a per-kilogram goal uses: the day's own, or the latest one before it. */
export interface ProteinGoalWeight {
  weightKg: number;
  logicalDate: string;
}

export interface ProteinGoalDay {
  targetG: number | null;
  weightKg: number | null;
  weightDate: string | null;
}

/**
 * The protein target of one day. A fixed goal needs no weight. A goal per
 * kilogram has no target on a day without a weight to use.
 */
export function proteinGoalForDay({
  mode,
  fixedTargetG,
  gramsPerKg,
  weight,
}: {
  mode: ProteinGoalMode;
  fixedTargetG: number | null;
  gramsPerKg: number | null;
  weight: ProteinGoalWeight | null;
}): ProteinGoalDay {
  if (mode === "grams") {
    return {
      targetG: fixedTargetG !== null && fixedTargetG > 0 ? fixedTargetG : null,
      weightKg: null,
      weightDate: null,
    };
  }
  const usable = weight !== null && weight.weightKg > 0 ? weight : null;
  const target =
    usable && gramsPerKg !== null && isValidProteinPerKg(gramsPerKg)
      ? Math.round(usable.weightKg * gramsPerKg * 10) / 10
      : null;
  return {
    targetG: target !== null && target > 0 ? target : null,
    weightKg: usable?.weightKg ?? null,
    weightDate: usable?.logicalDate ?? null,
  };
}
