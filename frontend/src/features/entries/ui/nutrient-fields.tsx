import type { ChangeEvent } from "react";
import {
  NUTRIENT_VALUE_ORIGINS,
  nutrientValueOriginLabel,
  type NutrientValueOrigin,
} from "@app/common/features/entries/utils/nutrient-provenance";
import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";
import type { NutrientTexts } from "../utils/entry-form.js";
import {
  groupedNutrientKeys,
  nutrientGroupLabel,
  nutrientLabel,
  nutrientUnit,
} from "../../core/utils/nutrient-format.js";

/** The fields of an open edit. Without them, the fields start empty and the form reads them when it is sent. */
interface ControlledNutrients {
  values: NutrientTexts;
  origins: NutrientTexts;
  disabled: boolean;
  onValueChange: (props: { key: NutrientKey; value: string }) => void;
  onOriginChange: (props: { key: NutrientKey; origin: string }) => void;
}

/** The optional nutrients of one item, in groups, each with the origin of its value. */
export function NutrientFields({
  idPrefix,
  controlled,
}: {
  idPrefix: string;
  controlled?: ControlledNutrients;
}) {
  return (
    <details className="advanced-nutrition-editor">
      <summary>Advanced nutrition</summary>
      <p className="advanced-nutrition-help">
        Optional values. Leave blank if unknown; an explicit 0 is kept as zero.
        Choose an origin for each known value.
      </p>
      <div className="advanced-nutrition-groups">
        {groupedNutrientKeys().map(({ group, keys }) => (
          <fieldset key={group}>
            <legend>{nutrientGroupLabel(group)}</legend>
            <div className="advanced-nutrition-grid">
              {keys.map((key) => {
                const inputId = `${idPrefix}${key}`;
                return (
                  <label key={key} htmlFor={inputId}>
                    <span>
                      {`${nutrientLabel(key)} `}
                      <small>{`(${nutrientUnit(key)})`}</small>
                    </span>
                    <input
                      id={inputId}
                      name={`nutrient-${key}`}
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      placeholder="—"
                      aria-describedby={`${inputId}-help`}
                      {...(controlled
                        ? {
                            value: controlled.values[key] ?? "",
                            disabled: controlled.disabled,
                            onChange: (event: ChangeEvent<HTMLInputElement>) =>
                              controlled.onValueChange({
                                key,
                                value: event.target.value,
                              }),
                          }
                        : { defaultValue: "" })}
                    />
                    <small id={`${inputId}-help`}>Leave blank if unknown</small>
                    <select
                      id={`${inputId}-origin`}
                      name={`nutrient-origin-${key}`}
                      aria-label={`${nutrientLabel(key)} value origin`}
                      {...(controlled
                        ? {
                            value: controlled.origins[key] ?? "",
                            disabled: controlled.disabled,
                            onChange: (event: ChangeEvent<HTMLSelectElement>) =>
                              controlled.onOriginChange({
                                key,
                                origin: event.target.value,
                              }),
                          }
                        : { defaultValue: "manual" })}
                    >
                      <option value="">{nutrientValueOriginLabel(null)}</option>
                      {NUTRIENT_VALUE_ORIGINS.map(
                        (origin: NutrientValueOrigin) => (
                          <option key={origin} value={origin}>
                            {nutrientValueOriginLabel(origin)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </details>
  );
}
