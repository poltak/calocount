import {
  ENTRY_KINDS,
  entryKindLabels,
} from "@app/common/features/entries/utils/entry-kind";
import type { TotalField } from "../utils/entry-form.js";
import { useDashboard } from "./dashboard-context.js";
import { NutrientFields } from "./nutrient-fields.js";

const TOTAL_FIELDS: [TotalField, string][] = [
  ["calories", "Calories"],
  ["protein", "Protein"],
  ["carbs", "Carbs"],
  ["fat", "Fat"],
];

/** The edit of one entry: its name, totals, type, and the nutrients of each item. */
export function EntryEditor() {
  const { form } = useDashboard();
  const { draft, saveEntryState } = form.state;
  if (!draft) {
    return null;
  }
  const saving = saveEntryState === "running";
  const { original } = draft;
  return (
    <div className="inline-editor">
      <label>
        Name
        <input
          value={draft.name}
          disabled={saving}
          onChange={(event) =>
            form.logic.changeDraft({ field: "name", value: event.target.value })
          }
        />
      </label>
      <label className="editor-description-field">
        Description
        <input
          value={draft.description}
          disabled={saving}
          onChange={(event) =>
            form.logic.changeDraft({
              field: "description",
              value: event.target.value,
            })
          }
        />
      </label>
      {TOTAL_FIELDS.map(([field, label]) => (
        <label key={field}>
          {label}
          <input
            type="number"
            min="0"
            step="any"
            value={draft.totals[field]}
            disabled={saving}
            onChange={(event) =>
              form.logic.changeDraft({ field, value: event.target.value })
            }
          />
        </label>
      ))}
      <label className="editor-type-field">
        Type
        <select
          aria-label="Entry type"
          value={draft.kind ?? ""}
          disabled={saving}
          onChange={(event) =>
            form.logic.changeDraft({ field: "kind", value: event.target.value })
          }
        >
          <option value="">Not set</option>
          {ENTRY_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {entryKindLabels[kind]}
            </option>
          ))}
        </select>
      </label>
      <div className="meal-item-editors">
        <div className="meal-item-editors-heading">
          <strong>Food item nutrition</strong>
          <span>Values stay with each item in this meal.</span>
        </div>
        {original.items.map((item, index) => {
          const itemDraft = draft.items[index];
          return (
            <div className="meal-item-editor" key={item.id ?? index}>
              <div className="meal-item-editor-heading">
                <strong>{item.name}</strong>
                <span>{`${item.quantity}${item.unit ? ` ${item.unit}` : " serving"}`}</span>
              </div>
              {itemDraft && (
                <NutrientFields
                  idPrefix={`edit-${original.id}-${item.id ?? index}-`}
                  controlled={{
                    values: itemDraft.nutrients,
                    origins: itemDraft.origins,
                    disabled: saving,
                    onValueChange: ({ key, value }) =>
                      form.logic.changeDraftNutrient({
                        itemIndex: index,
                        key,
                        value,
                      }),
                    onOriginChange: ({ key, origin }) =>
                      form.logic.changeDraftOrigin({
                        itemIndex: index,
                        key,
                        origin,
                      }),
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="editor-actions">
        <button
          className="cancel-button"
          type="button"
          disabled={saving}
          onClick={() => form.logic.cancelEdit()}
        >
          Cancel
        </button>
        <button
          className="done-button"
          type="button"
          disabled={saving}
          aria-busy={saving}
          onClick={() => void form.logic.saveEdit()}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
