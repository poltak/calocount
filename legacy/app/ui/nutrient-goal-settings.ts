import { h } from "./dom";
import {
  NUTRIENT_GOAL_DEFINITIONS,
} from "../../domain/nutrient-goals";
import type { NutrientKey } from "../../domain/nutrients";
import type { NutrientGoalDraft } from "../nutrition/nutrient-goal-draft";
import { nutrientGoalKind } from "../../domain/nutrient-references";
import {
  defaultNutrientGoals,
  formatNutrientAmount,
  groupedNutrientKeys,
  nutrientGroupLabel,
  nutrientLabel,
  nutrientMeta,
  nutrientUnit,
} from "../nutrition/nutrient-meta";

type NutrientGoalSettingsProps = {
  disabled?: boolean;
  onChange: (key: NutrientKey, value: string) => void;
  onReset: () => void;
  values: NutrientGoalDraft;
};

export function nutrientGoalSettings({ disabled = false, onChange, onReset, values }: NutrientGoalSettingsProps) {
  return h("details", { class: "nutrient-goal-settings" },
    h("summary", null,
      h("span", null, h("strong", null, "Nutrition goals"), h("small", null, "Vitamins, minerals, fats, carbohydrates, and caffeine")),
      h("span", { class: "settings-summary-action" }, "Customise"),
    ),
    h("div", { class: "nutrient-goal-settings-body" },
      h("div", { class: "nutrient-goal-settings-intro" },
        h("p", null, "General defaults use FDA Daily Values. Blank a field to turn that goal off."),
        h("button", { class: "secondary-button", type: "button", onclick: onReset, disabled }, "Restore recommended defaults"),
      ),
      groupedNutrientKeys().map(({ group, keys }) => h("fieldset", { class: "nutrient-goal-fieldset" },
        h("legend", null, nutrientGroupLabel(group)),
        h("div", { class: "nutrient-goal-input-grid" }, keys.map((key) => {
          const definition = NUTRIENT_GOAL_DEFINITIONS[key];
          const inputStep = 10 ** -nutrientMeta(key).precision;
          const inputId = `nutrient-target-${key}`;
          const defaultIsReference = nutrientGoalKind(key, defaultNutrientGoals[key]) === "reference";
          const defaultLabel = definition.defaultValue === null
            ? "No general default"
            : `Default ${formatNutrientAmount(definition.defaultValue, key)} ${nutrientUnit(key)}`;
          return h("label", { "aria-label": `${nutrientLabel(key)} daily goal`, class: "nutrient-goal-input", for: inputId },
            h("span", null,
              h("strong", null, nutrientLabel(key)),
              h("small", null, `${definition.direction === "maximum" ? "Maximum" : "At least"} · ${defaultLabel}${defaultIsReference ? " (shown as a reference, not a limit)" : ""}`),
            ),
            h("span", { class: "nutrient-goal-input-control" },
              h("input", {
                id: inputId,
                name: `nutrient-target-${key}`,
                type: "number",
                min: inputStep,
                step: inputStep,
                placeholder: "Off",
                value: values[key],
                oninput: (event: Event) => onChange(key, (event.target as HTMLInputElement).value),
                disabled,
                inputmode: "decimal",
              }),
              h("span", null, nutrientUnit(key)),
            ),
          );
        })),
      )),
      h("p", { class: "nutrient-goal-disclaimer" }, "These defaults are general reference values, not personalised medical advice."),
    ),
  );
}
