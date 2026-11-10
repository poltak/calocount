import {
  NUTRIENT_GOAL_DEFINITIONS,
  nutrientGoalKind,
  resolveNutrientGoals,
} from "@app/common/features/entries/utils/nutrient-goals";
import { NUTRIENT_META } from "@app/common/features/entries/utils/nutrients";
import {
  formatNutrientAmount,
  groupedNutrientKeys,
  nutrientGroupLabel,
  nutrientLabel,
  nutrientUnit,
} from "../../core/utils/nutrient-format.js";
import type { NutrientGoalDraft } from "../utils/settings-draft.js";
import { useSettings } from "./settings-context.js";

const DEFAULT_GOALS = resolveNutrientGoals();

/** The goal of each nutrient. A blank field turns the goal off. */
export function NutrientGoalSettings({
  values,
  disabled,
}: {
  values: NutrientGoalDraft;
  disabled: boolean;
}) {
  const { logic } = useSettings();
  return (
    <details className="nutrient-goal-settings">
      <summary>
        <span>
          <strong>Nutrition goals</strong>
          <small>Vitamins, minerals, fats, carbohydrates, and caffeine</small>
        </span>
        <span className="settings-summary-action">Customise</span>
      </summary>
      <div className="nutrient-goal-settings-body">
        <div className="nutrient-goal-settings-intro">
          <p>
            General defaults use FDA Daily Values. Blank a field to turn that
            goal off.
          </p>
          <button
            className="secondary-button"
            type="button"
            disabled={disabled}
            onClick={() => logic.restoreRecommendedGoals()}
          >
            Restore recommended defaults
          </button>
        </div>
        {groupedNutrientKeys().map(({ group, keys }) => (
          <fieldset className="nutrient-goal-fieldset" key={group}>
            <legend>{nutrientGroupLabel(group)}</legend>
            <div className="nutrient-goal-input-grid">
              {keys.map((key) => {
                const definition = NUTRIENT_GOAL_DEFINITIONS[key];
                const precision =
                  NUTRIENT_META.find((meta) => meta.key === key)?.precision ??
                  1;
                const step = 10 ** -precision;
                const inputId = `nutrient-target-${key}`;
                const asReference =
                  nutrientGoalKind(key, DEFAULT_GOALS[key]) === "reference";
                const defaultLabel =
                  definition.defaultValue === null
                    ? "No general default"
                    : `Default ${formatNutrientAmount(definition.defaultValue, key)} ${nutrientUnit(key)}`;
                return (
                  <label
                    key={key}
                    className="nutrient-goal-input"
                    htmlFor={inputId}
                    aria-label={`${nutrientLabel(key)} daily goal`}
                  >
                    <span>
                      <strong>{nutrientLabel(key)}</strong>
                      <small>
                        {`${definition.direction === "maximum" ? "Maximum" : "At least"} · ${defaultLabel}${asReference ? " (shown as a reference, not a limit)" : ""}`}
                      </small>
                    </span>
                    <span className="nutrient-goal-input-control">
                      <input
                        id={inputId}
                        name={inputId}
                        type="number"
                        min={step}
                        step={step}
                        placeholder="Off"
                        inputMode="decimal"
                        value={values[key]}
                        disabled={disabled}
                        onChange={(event) =>
                          logic.changeNutrient({
                            key,
                            value: event.target.value,
                          })
                        }
                      />
                      <span>{nutrientUnit(key)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        <p className="nutrient-goal-disclaimer">
          These defaults are general reference values, not personalised medical
          advice.
        </p>
      </div>
    </details>
  );
}
