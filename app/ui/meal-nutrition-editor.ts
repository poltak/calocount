import { h } from "./dom";
import { groupedNutrientKeys, nutrientGroupLabel, nutrientLabel, nutrientUnit, parseNutrientValue, type NutrientValueMap } from "../nutrition/nutrient-meta";
import { NUTRIENT_VALUE_ORIGINS, nutrientValueOriginLabel, type NutrientProvenanceMap, type NutrientValueOrigin } from "../../domain/nutrient-provenance";
import type { NutrientKey } from "../../domain/nutrients";
import { NUTRIENT_UPPER_LIMIT_META, type NutrientUpperLimitKey } from "../../domain/nutrients";

type MealNutritionEditorProps = {
  /** The starting values. Without them the fields start empty, as in the add form. */
  values?: NutrientValueMap;
  provenance?: NutrientProvenanceMap;
  onChange?: (key: NutrientKey | NutrientUpperLimitKey, value: number | null) => void;
  /** Store an origin and return the origin that applies after the change. */
  onProvenanceChange?: (key: NutrientKey, origin: NutrientValueOrigin | null) => NutrientValueOrigin | null;
  namePrefix?: string;
  originNamePrefix?: string;
  idPrefix?: string;
  disabled?: boolean;
  heading?: string;
};

function fieldValue(values: NutrientValueMap | undefined, key: string) {
  if (!values) return undefined;
  const current = values[key];
  return current === null || current === undefined ? "" : String(current);
}

export function mealNutritionEditor({ values, provenance, onChange, onProvenanceChange, namePrefix = "nutrient-", originNamePrefix = "nutrient-origin-", idPrefix = "nutrition-", disabled = false, heading = "Advanced nutrition" }: MealNutritionEditorProps) {
  return h("details", { class: "advanced-nutrition-editor" },
    h("summary", null, heading),
    h("p", { class: "advanced-nutrition-help" }, "Optional values. Leave blank if unknown; an explicit 0 is kept as zero. Choose an origin for each known value."),
    h("div", { class: "advanced-nutrition-groups" },
      groupedNutrientKeys().map(({ group, keys }) => h("fieldset", null,
        h("legend", null, nutrientGroupLabel(group)),
        h("div", { class: "advanced-nutrition-grid" }, keys.map((key) => {
          const inputId = `${idPrefix}${key}`;
          const origin: HTMLSelectElement = h("select", {
            id: `${inputId}-origin`,
            name: `${originNamePrefix}${key}`,
            "aria-label": `${nutrientLabel(key)} value origin`,
            value: provenance !== undefined ? provenance[key] ?? "" : values !== undefined ? "" : "manual",
            disabled,
            onchange: onProvenanceChange ? () => {
              const chosen = NUTRIENT_VALUE_ORIGINS.includes(origin.value as NutrientValueOrigin) ? origin.value as NutrientValueOrigin : null;
              origin.value = onProvenanceChange(key, chosen) ?? "";
            } : undefined,
          },
            h("option", { value: "" }, nutrientValueOriginLabel(null)),
            NUTRIENT_VALUE_ORIGINS.map((option) => h("option", { value: option }, nutrientValueOriginLabel(option))),
          );
          return h("label", { for: inputId },
            h("span", null, `${nutrientLabel(key)} `, h("small", null, `(${nutrientUnit(key)})`)),
            h("input", {
              id: inputId,
              name: `${namePrefix}${key}`,
              type: "number",
              min: "0",
              step: "any",
              inputmode: "decimal",
              placeholder: "—",
              "aria-describedby": `${inputId}-help`,
              value: fieldValue(values, key),
              disabled,
              oninput: onChange ? (event: Event) => {
                const value = parseNutrientValue((event.target as HTMLInputElement).value);
                onChange(key, value);
                if (onProvenanceChange) origin.value = onProvenanceChange(key, value === null ? null : "manual") ?? "";
              } : undefined,
            }),
            h("small", { id: `${inputId}-help` }, "Leave blank if unknown"),
            origin,
          );
        })),
      )),
      h("fieldset", null,
        h("legend", null, "Upper-limit details"),
        h("p", { class: "advanced-nutrition-help" }, "Enter these only when the food label or supplement identifies the specific form and amount. Leave blank when unknown; these values are separate from total vitamin and mineral amounts."),
        h("div", { class: "advanced-nutrition-grid" }, NUTRIENT_UPPER_LIMIT_META.map(({ key, label, unit }) => h("label", { for: `${idPrefix}${key}` },
          h("span", null, `${label} `, h("small", null, `(${unit})`)),
          h("input", {
            id: `${idPrefix}${key}`,
            name: `${namePrefix}${key}`,
            type: "number",
            min: "0",
            step: "any",
            inputmode: "decimal",
            placeholder: "—",
            value: fieldValue(values, key),
            disabled,
            oninput: onChange ? (event: Event) => onChange(key, parseNutrientValue((event.target as HTMLInputElement).value)) : undefined,
          }),
          h("small", null, "Leave blank if unknown"),
        ))),
      ),
    ),
  );
}
