import {
  ENTRY_KINDS,
  entryKindLabels,
} from "@app/common/features/entries/utils/entry-kind";
import { MEAL_PHOTO_TYPES } from "@app/common/features/entries/utils/meal-photo";
import { readEntryForm } from "../utils/entry-form.js";
import { useDashboard } from "./dashboard-context.js";
import { NutrientFields } from "./nutrient-fields.js";

function NumberField({
  label,
  name,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type="number"
        min="0"
        step="any"
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

/** The form for a new entry on the day in view. The browser holds what the owner types. */
export function AddEntryForm() {
  const { dashboard, form } = useDashboard();
  const saving = form.state.addEntryState === "running";
  return (
    <form
      className={saving ? "add-meal-form is-pending" : "add-meal-form"}
      aria-label="Log an entry"
      aria-busy={saving}
      onSubmit={(event) => {
        event.preventDefault();
        if (dashboard.state.selectedDate) {
          void form.logic.addEntry({
            date: dashboard.state.selectedDate,
            values: readEntryForm(event.currentTarget),
          });
        }
      }}
    >
      <div className="form-heading">
        <div>
          <strong>Log an entry</strong>
          <span>Use a quick estimate now. You can edit it later.</span>
        </div>
        <label>
          Time
          <input
            name="time"
            type="time"
            defaultValue={form.state.formTime}
            required
            aria-label="Entry time"
          />
        </label>
        <label>
          Type
          <select
            name="mealType"
            defaultValue={form.state.formKind}
            aria-label="Entry type"
          >
            {ENTRY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {entryKindLabels[kind]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="close-button"
          type="button"
          aria-label="Close add entry form"
          onClick={() => form.logic.closeAddForm()}
        >
          ×
        </button>
      </div>
      <label>
        Entry name
        <input name="name" placeholder="e.g. Turkey sandwich" required />
      </label>
      <label className="wide-field">
        Description
        <input name="description" placeholder="Ingredients or a short note" />
      </label>
      <NumberField
        label="Calories"
        name="calories"
        placeholder="450"
        required
      />
      <NumberField label="Protein (g)" name="protein" placeholder="30" />
      <NumberField label="Carbs (g)" name="carbs" placeholder="45" />
      <NumberField label="Fat (g)" name="fat" placeholder="15" />
      <label className="meal-photo-field">
        Photo (optional)
        <input name="photo" type="file" accept={MEAL_PHOTO_TYPES.join(",")} />
        <small>JPEG, PNG, or WebP · up to 10 MB</small>
      </label>
      <NutrientFields idPrefix="nutrition-" />
      <button
        className="save-button"
        type="submit"
        disabled={saving}
        aria-busy={saving}
      >
        {saving ? "Saving…" : "Save entry"}
      </button>
    </form>
  );
}
