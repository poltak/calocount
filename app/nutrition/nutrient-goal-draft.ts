import { NUTRIENT_GOAL_DEFINITIONS, resolveNutrientGoals, type NutrientGoalMap, type NutrientGoalOverrides } from "../../domain/nutrient-goals";
import type { NutrientKey } from "../../domain/nutrients";

export type NutrientGoalDraft = Record<NutrientKey, string>;

export function nutrientGoalDraftFromMap(goals: NutrientGoalMap = resolveNutrientGoals()): NutrientGoalDraft {
  const draft = {} as NutrientGoalDraft;
  for (const [key, goal] of Object.entries(goals) as Array<[NutrientKey, NutrientGoalMap[NutrientKey]]>) {
    draft[key] = goal.value === null ? "" : String(goal.value);
  }
  return draft;
}

export function nutrientGoalOverridesFromDraft(draft: NutrientGoalDraft): NutrientGoalOverrides {
  const overrides: NutrientGoalOverrides = {};
  for (const [key, value] of Object.entries(draft) as Array<[NutrientKey, string]>) {
    const definition = NUTRIENT_GOAL_DEFINITIONS[key];
    const trimmed = value.trim();
    if (!trimmed) {
      if (definition.defaultValue !== null) overrides[key] = null;
      continue;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0 && parsed !== definition.defaultValue) overrides[key] = parsed;
  }
  return overrides;
}
