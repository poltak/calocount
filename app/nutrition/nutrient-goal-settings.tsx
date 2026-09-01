import {
  NUTRIENT_GOAL_DEFINITIONS,
  resolveNutrientGoals,
  type NutrientGoalMap,
  type NutrientGoalOverrides,
} from "../../domain/nutrient-goals";
import type { NutrientKey } from "../../domain/nutrients";
import {
  formatNutrientAmount,
  groupedNutrientKeys,
  nutrientGroupLabel,
  nutrientLabel,
  nutrientMeta,
  nutrientUnit,
} from "./nutrient-meta";

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

type NutrientGoalSettingsProps = {
  disabled?: boolean;
  onChange: (key: NutrientKey, value: string) => void;
  onReset: () => void;
  values: NutrientGoalDraft;
};

export function NutrientGoalSettings({ disabled = false, onChange, onReset, values }: NutrientGoalSettingsProps) {
  return <details className="nutrient-goal-settings">
    <summary>
      <span><strong>Nutrition goals</strong><small>Vitamins, minerals, fats, carbohydrates, and caffeine</small></span>
      <span className="settings-summary-action">Customise</span>
    </summary>
    <div className="nutrient-goal-settings-body">
      <div className="nutrient-goal-settings-intro">
        <p>General defaults use FDA Daily Values. Blank a field to turn that goal off.</p>
        <button className="secondary-button" type="button" onClick={onReset} disabled={disabled}>Restore recommended defaults</button>
      </div>
      {groupedNutrientKeys().map(({ group, keys }) => <fieldset className="nutrient-goal-fieldset" key={group}>
        <legend>{nutrientGroupLabel(group)}</legend>
        <div className="nutrient-goal-input-grid">
          {keys.map((rawKey) => {
            const key = rawKey as NutrientKey;
            const definition = NUTRIENT_GOAL_DEFINITIONS[key];
            const inputStep = 10 ** -nutrientMeta(key).precision;
            const inputId = `nutrient-target-${key}`;
            const defaultLabel = definition.defaultValue === null
              ? "No general default"
              : `Default ${formatNutrientAmount(definition.defaultValue, key)} ${nutrientUnit(key)}`;
            return <label aria-label={`${nutrientLabel(key)} daily goal`} className="nutrient-goal-input" htmlFor={inputId} key={key}>
              <span><strong>{nutrientLabel(key)}</strong><small>{definition.direction === "maximum" ? "Maximum" : "At least"} · {defaultLabel}</small></span>
              <span className="nutrient-goal-input-control">
                <input
                  id={inputId}
                  name={`nutrient-target-${key}`}
                  type="number"
                  min={inputStep}
                  step={inputStep}
                  placeholder="Off"
                  value={values[key]}
                  onChange={(event) => onChange(key, event.target.value)}
                  disabled={disabled}
                  inputMode="decimal"
                />
                <span>{nutrientUnit(key)}</span>
              </span>
            </label>;
          })}
        </div>
      </fieldset>)}
      <p className="nutrient-goal-disclaimer">These defaults are general reference values, not personalised medical advice.</p>
    </div>
  </details>;
}
