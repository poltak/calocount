import { groupedNutrientKeys, nutrientGroupLabel, nutrientLabel, nutrientUnit, parseNutrientValue, nutrientKeys, type NutrientValueMap } from "./nutrient-meta";
import { NUTRIENT_VALUE_ORIGINS, nutrientValueOriginLabel, parseNutrientProvenance, type NutrientProvenanceMap, type NutrientValueOrigin } from "../../domain/nutrient-provenance";
import type { NutrientKey } from "../../domain/nutrients";
import { NUTRIENT_UPPER_LIMIT_META, NUTRIENT_UPPER_LIMIT_KEYS, type NutrientUpperLimitKey } from "../../domain/nutrients";

type MealNutritionEditorProps = {
  values?: NutrientValueMap;
  provenance?: NutrientProvenanceMap;
  onChange?: (key: NutrientKey | NutrientUpperLimitKey, value: number | null) => void;
  onProvenanceChange?: (key: NutrientKey, origin: NutrientValueOrigin | null) => void;
  namePrefix?: string;
  originNamePrefix?: string;
  idPrefix?: string;
  disabled?: boolean;
  heading?: string;
};

export function MealNutritionEditor({ values, provenance, onChange, onProvenanceChange, namePrefix = "nutrient-", originNamePrefix = "nutrient-origin-", idPrefix = "nutrition-", disabled = false, heading = "Advanced nutrition" }: MealNutritionEditorProps) {
  return <details className="advanced-nutrition-editor">
    <summary>{heading}</summary>
    <p className="advanced-nutrition-help">Optional values. Leave blank if unknown; an explicit 0 is kept as zero. Choose an origin for each known value.</p>
    <div className="advanced-nutrition-groups">
      {groupedNutrientKeys().map(({ group, keys }) => <fieldset key={group}>
        <legend>{nutrientGroupLabel(group)}</legend>
        <div className="advanced-nutrition-grid">
          {keys.map((key) => {
            const inputId = `${idPrefix}${key}`;
            const current = values?.[key];
            const currentOrigin = provenance?.[key] ?? "";
            const controlled = provenance !== undefined && onProvenanceChange !== undefined;
            return <label key={key} htmlFor={inputId}>
              <span>{nutrientLabel(key)} <small>({nutrientUnit(key)})</small></span>
              <input
                id={inputId}
                name={`${namePrefix}${key}`}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="—"
                aria-describedby={`${inputId}-help`}
                value={values ? (current === null || current === undefined ? "" : String(current)) : undefined}
                disabled={disabled}
                onChange={onChange ? (event) => {
                  const value = parseNutrientValue(event.target.value) as number | null;
                  onChange(key, value);
                  onProvenanceChange?.(key, value === null ? null : "manual");
                } : undefined}
              />
              <small id={`${inputId}-help`}>Leave blank if unknown</small>
              <select
                id={`${inputId}-origin`}
                name={`${originNamePrefix}${key}`}
                aria-label={`${nutrientLabel(key)} value origin`}
                value={controlled ? currentOrigin : undefined}
                defaultValue={controlled ? undefined : provenance !== undefined ? currentOrigin : values !== undefined ? "" : "manual"}
                disabled={disabled}
                onChange={onProvenanceChange ? (event) => onProvenanceChange(key, NUTRIENT_VALUE_ORIGINS.includes(event.target.value as NutrientValueOrigin) ? event.target.value as NutrientValueOrigin : null) : undefined}
              >
                <option value="">{nutrientValueOriginLabel(null)}</option>
                {NUTRIENT_VALUE_ORIGINS.map((origin) => <option value={origin} key={origin}>{nutrientValueOriginLabel(origin)}</option>)}
              </select>
            </label>;
          })}
        </div>
      </fieldset>)}
      <fieldset>
        <legend>Upper-limit details</legend>
        <p className="advanced-nutrition-help">Enter these only when the food label or supplement identifies the specific form and amount. Leave blank when unknown; these values are separate from total vitamin and mineral amounts.</p>
        <div className="advanced-nutrition-grid">
          {NUTRIENT_UPPER_LIMIT_META.map(({ key, label, unit }) => <label key={key} htmlFor={`${idPrefix}${key}`}>
            <span>{label} <small>({unit})</small></span>
            <input
              id={`${idPrefix}${key}`}
              name={`${namePrefix}${key}`}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="—"
              value={values ? (values[key] == null ? "" : String(values[key])) : undefined}
              disabled={disabled}
              onChange={onChange ? (event) => onChange(key, parseNutrientValue(event.target.value) as number | null) : undefined}
            />
            <small>Leave blank if unknown</small>
          </label>)}
        </div>
      </fieldset>
    </div>
  </details>;
}

export function nutrientValuesFromForm(form: FormData, namePrefix = "nutrient-"): NutrientValueMap {
  const values: NutrientValueMap = {};
  for (const key of nutrientKeys) values[key] = parseNutrientValue(form.get(`${namePrefix}${key}`));
  for (const key of NUTRIENT_UPPER_LIMIT_KEYS) values[key] = parseNutrientValue(form.get(`${namePrefix}${key}`));
  return values;
}

export function nutrientProvenanceFromForm(
  form: FormData,
  namePrefix = "nutrient-origin-",
  values = nutrientValuesFromForm(form),
): NutrientProvenanceMap {
  const raw: Partial<Record<NutrientKey, unknown>> = {};
  for (const key of nutrientKeys) raw[key] = form.get(`${namePrefix}${key}`);
  return parseNutrientProvenance(raw, values);
}
