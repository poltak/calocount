export const PROTEIN_GOAL_MODES = ["grams", "gramsPerKg"] as const;
export type ProteinGoalMode = typeof PROTEIN_GOAL_MODES[number];

export const PROTEIN_PER_KG_MIN = 0.8;
export const PROTEIN_PER_KG_MAX = 3;
export const PROTEIN_PER_KG_STEP = 0.1;
export const DEFAULT_PROTEIN_PER_KG = 1.6;

export type ProteinGoalWeight = {
  logicalDate: string;
  weightKg: number;
};

export type ProteinGoalDay = {
  date: string;
  targetG: number | null;
  weightKg: number | null;
  weightDate: string | null;
};

export type ProteinGoalSummary = {
  mode: ProteinGoalMode;
  gramsPerKg: number | null;
  fixedTargetG: number | null;
  targetG: number | null;
  weightKg: number | null;
  weightDate: string | null;
  byDate: ProteinGoalDay[];
};

export function isProteinGoalMode(value: unknown): value is ProteinGoalMode {
  return value === "grams" || value === "gramsPerKg";
}

export function normaliseProteinGoalMode(value: unknown): ProteinGoalMode {
  return isProteinGoalMode(value) ? value : "grams";
}

export function isValidProteinPerKg(value: number): boolean {
  return Number.isFinite(value) && value >= PROTEIN_PER_KG_MIN && value <= PROTEIN_PER_KG_MAX;
}

export function calculateProteinTargetG({ weightKg, gramsPerKg }: { weightKg: number | null | undefined; gramsPerKg: number | null | undefined }): number | null {
  if (!Number.isFinite(weightKg) || !isValidProteinPerKg(Number(gramsPerKg))) return null;
  const target = Number(weightKg) * Number(gramsPerKg);
  if (!Number.isFinite(target) || target <= 0) return null;
  return Math.round(target * 10) / 10;
}

function weightForDate(date: string, weights: readonly ProteinGoalWeight[]): ProteinGoalWeight | null {
  return weights
    .filter((weight) => weight.logicalDate <= date && Number.isFinite(weight.weightKg) && weight.weightKg > 0)
    .sort((left, right) => right.logicalDate.localeCompare(left.logicalDate))[0] ?? null;
}

export function resolveProteinGoalDay({
  date,
  mode,
  fixedTargetG,
  gramsPerKg,
  weights,
}: {
  date: string;
  mode: ProteinGoalMode;
  fixedTargetG: number | null | undefined;
  gramsPerKg: number | null | undefined;
  weights: readonly ProteinGoalWeight[];
}): ProteinGoalDay {
  if (mode === "grams") {
    return {
      date,
      targetG: Number.isFinite(fixedTargetG) && Number(fixedTargetG) > 0 ? Number(fixedTargetG) : null,
      weightKg: null,
      weightDate: null,
    };
  }

  const weight = weightForDate(date, weights);
  return {
    date,
    targetG: calculateProteinTargetG({ weightKg: weight?.weightKg, gramsPerKg }),
    weightKg: weight?.weightKg ?? null,
    weightDate: weight?.logicalDate ?? null,
  };
}

export function buildProteinGoalSummary({
  dates,
  mode,
  fixedTargetG,
  gramsPerKg,
  weights,
}: {
  dates: readonly string[];
  mode: ProteinGoalMode;
  fixedTargetG: number | null | undefined;
  gramsPerKg: number | null | undefined;
  weights: readonly ProteinGoalWeight[];
}): ProteinGoalSummary {
  const byDate = dates.map((date) => resolveProteinGoalDay({
    date,
    mode,
    fixedTargetG,
    gramsPerKg,
    weights,
  }));
  const current = byDate.at(-1) ?? resolveProteinGoalDay({
    date: "",
    mode,
    fixedTargetG,
    gramsPerKg,
    weights,
  });
  return {
    mode,
    gramsPerKg: mode === "gramsPerKg" && isValidProteinPerKg(Number(gramsPerKg)) ? Number(gramsPerKg) : null,
    fixedTargetG: Number.isFinite(fixedTargetG) && Number(fixedTargetG) > 0 ? Number(fixedTargetG) : null,
    targetG: current.targetG,
    weightKg: current.weightKg,
    weightDate: current.weightDate,
    byDate,
  };
}

export function updateProteinGoalSettings({
  current,
  mode,
  fixedTargetG,
  gramsPerKg,
}: {
  current: ProteinGoalSummary;
  mode: ProteinGoalMode;
  fixedTargetG: number | null | undefined;
  gramsPerKg: number | null | undefined;
}): ProteinGoalSummary {
  const byDate = current.byDate.map((day) => ({
    ...day,
    targetG: resolveProteinGoalDay({
      date: day.date,
      mode,
      fixedTargetG,
      gramsPerKg,
      weights: day.weightKg == null || day.weightDate == null
        ? []
        : [{ logicalDate: day.weightDate, weightKg: day.weightKg }],
    }).targetG,
  }));
  const latest = byDate.at(-1);
  return {
    mode,
    gramsPerKg: mode === "gramsPerKg" && isValidProteinPerKg(Number(gramsPerKg)) ? Number(gramsPerKg) : null,
    fixedTargetG: Number.isFinite(fixedTargetG) && Number(fixedTargetG) > 0 ? Number(fixedTargetG) : null,
    targetG: latest?.targetG ?? (mode === "grams" && Number.isFinite(fixedTargetG) ? Number(fixedTargetG) : null),
    weightKg: latest?.weightKg ?? current.weightKg,
    weightDate: latest?.weightDate ?? current.weightDate,
    byDate,
  };
}
