import {
  NUTRIENT_GOAL_DEFINITIONS,
} from "../../domain/nutrient-goals";
import type { NutrientKey } from "../../domain/nutrients";
import type { NutrientGoalDraft } from "./nutrient-goal-draft";
import {
  formatNutrientAmount,
  groupedNutrientKeys,
  nutrientGroupLabel,
  nutrientLabel,
  nutrientMeta,
  nutrientUnit,
} from "./nutrient-meta";

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
