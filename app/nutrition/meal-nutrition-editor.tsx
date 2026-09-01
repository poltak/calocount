import { groupedNutrientKeys, nutrientGroupLabel, nutrientLabel, nutrientUnit, parseNutrientValue, nutrientKeys, type NutrientValueMap } from "./nutrient-meta";

type MealNutritionEditorProps = {
  values?: NutrientValueMap;
  onChange?: (key: string, value: number | null) => void;
  namePrefix?: string;
  idPrefix?: string;
  disabled?: boolean;
  heading?: string;
};

export function MealNutritionEditor({ values, onChange, namePrefix = "nutrient-", idPrefix = "nutrition-", disabled = false, heading = "Advanced nutrition" }: MealNutritionEditorProps) {
  return <details className="advanced-nutrition-editor">
    <summary>{heading}</summary>
    <p className="advanced-nutrition-help">Optional estimates. Leave blank if unknown; an explicit 0 is kept as zero.</p>
    <div className="advanced-nutrition-groups">
      {groupedNutrientKeys().map(({ group, keys }) => <fieldset key={group}>
        <legend>{nutrientGroupLabel(group)}</legend>
        <div className="advanced-nutrition-grid">
          {keys.map((key) => {
            const inputId = `${idPrefix}${key}`;
            const current = values?.[key];
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
                onChange={onChange ? (event) => onChange(key, parseNutrientValue(event.target.value) as number | null) : undefined}
              />
              <small id={`${inputId}-help`}>Leave blank if unknown</small>
            </label>;
          })}
        </div>
      </fieldset>)}
    </div>
  </details>;
}

export function nutrientValuesFromForm(form: FormData, namePrefix = "nutrient-"): NutrientValueMap {
  const values: NutrientValueMap = {};
  for (const key of nutrientKeys) values[key] = parseNutrientValue(form.get(`${namePrefix}${key}`));
  return values;
}
