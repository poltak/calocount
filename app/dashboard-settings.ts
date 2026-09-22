import { DEFAULT_PROTEIN_PER_KG, type ProteinGoalMode, type ProteinGoalSummary } from "../domain/protein-goals";
import type { NutrientGoalMap } from "./nutrition/nutrient-meta";
import { nutrientGoalDraftFromMap, type NutrientGoalDraft } from "./nutrition/nutrient-goal-draft";

export type TargetState = {
  calories: number;
  proteinG: number;
  nutrients: NutrientGoalMap;
};

export type SettingsDraft = {
  calories: string;
  proteinG: string;
  proteinGoalMode: ProteinGoalMode;
  proteinPerKg: string;
  nutrients: NutrientGoalDraft;
  vitaminB6UsFnbAdultUlEnabled: boolean;
  usFnbAdultUlEnabled: boolean;
};

export function settingsDraftForTargets(targets: TargetState, proteinGoal: ProteinGoalSummary, vitaminB6UsFnbAdultUlEnabled = false, usFnbAdultUlEnabled = false): SettingsDraft {
  return {
    calories: String(targets.calories),
    proteinG: String(proteinGoal.fixedTargetG ?? targets.proteinG),
    proteinGoalMode: proteinGoal.mode,
    proteinPerKg: String(proteinGoal.gramsPerKg ?? DEFAULT_PROTEIN_PER_KG),
    nutrients: nutrientGoalDraftFromMap(targets.nutrients),
    vitaminB6UsFnbAdultUlEnabled,
    usFnbAdultUlEnabled,
  };
}
