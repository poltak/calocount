import { h } from "./dom";
import type { NutrientKey, NutrientUpperLimitKey } from "../../domain/nutrients";
import type { NutrientValueOrigin } from "../../domain/nutrient-provenance";
import type { MealDraftChanges } from "../dashboard-edit";
import { MEAL_KINDS, mealKind, mealKindLabels, type MealKind } from "../meal-kind";
import type { NutritionItem } from "../nutrition/nutrition-item";
import { mealNutritionEditor } from "./meal-nutrition-editor";

export const mealPhotoAccept = "image/jpeg,image/png,image/webp";
const maxMealPhotoBytes = 10 * 1024 * 1024;

/** Explain why a selected photo cannot be uploaded, or return null when it can. */
export function mealPhotoError(photo: File): string | null {
  if (!mealPhotoAccept.split(",").includes(photo.type)) return "Select a JPEG, PNG, or WebP image.";
  if (photo.size > maxMealPhotoBytes) return "Select an image that is 10 MB or smaller.";
  return null;
}

type EditorMeal = {
  id: string;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs?: number;
  fat?: number;
  kind?: MealKind | null;
  photoKey?: string | null;
  items: NutritionItem[];
};

type MealEditorOptions = {
  /** The draft when the editor opens. */
  meal: EditorMeal;
  className?: string;
  /** Distinguishes field IDs when two editors could exist for the same entry. */
  idPrefix: string;
  itemsHint: string;
  onChange: (changes: MealDraftChanges) => void;
  onItemChange: (itemId: string | undefined, itemIndex: number, key: NutrientKey | NutrientUpperLimitKey, value: number | null) => void;
  /** Store an origin and return the origin that applies after the change. */
  onItemProvenanceChange: (itemId: string | undefined, itemIndex: number, key: NutrientKey, origin: NutrientValueOrigin | null) => NutrientValueOrigin | null;
  onPhotoChange: (photo: File | null) => void;
  onPhotoError: (message: string | null) => void;
  onCancel: () => void;
  onSave: () => void;
};

export type MealEditor = {
  el: HTMLElement;
  /** Apply the state that comes from outside the editor. */
  sync: (state: { disabled: boolean; saving: boolean; photoName: string | null }) => void;
  /** Show a draft that another editor of the same entry changed. */
  refresh: (meal: EditorMeal) => void;
};

/** A number input that can be emptied while typing. An empty field counts as zero. */
function totalField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return h("label", null, label, h("input", {
    type: "number",
    min: "0",
    step: "any",
    value: String(value),
    oninput: (event: Event) => {
      const parsed = Number((event.target as HTMLInputElement).value);
      onChange(Number.isFinite(parsed) ? parsed : 0);
    },
  }));
}

/** The entry type options, shared by the add form and the editor. */
export function mealKindOptions({ allowUnset = false }: { allowUnset?: boolean } = {}) {
  return [
    allowUnset ? h("option", { value: "" }, "Not set") : null,
    MEAL_KINDS.map((kind) => h("option", { value: kind }, mealKindLabels[kind])),
  ];
}

/**
 * The edit form for one entry: its totals, photo and per-item nutrition.
 * The fields keep what the user typed; each change goes to the draft through
 * the callbacks, and the form is not built again while it is open.
 */
export function createMealEditor({
  meal,
  className = "inline-editor",
  idPrefix,
  itemsHint,
  onChange,
  onItemChange,
  onItemProvenanceChange,
  onPhotoChange,
  onPhotoError,
  onCancel,
  onSave,
}: MealEditorOptions): MealEditor {
  const hasSavedPhoto = Boolean(meal.photoKey);
  const name: HTMLInputElement = h("input", { value: meal.name, oninput: () => onChange({ name: name.value }) });
  const description: HTMLInputElement = h("input", { value: meal.description, oninput: () => onChange({ description: description.value }) });
  const photoHint = h("small");
  const kind: HTMLSelectElement = h("select", { value: meal.kind ?? "", "aria-label": "Entry type", onchange: () => onChange({ kind: mealKind(kind.value) }) }, mealKindOptions({ allowUnset: true }));
  const save = h("button", { class: "done-button", type: "button", onclick: onSave });
  const itemPrefix = (item: NutritionItem, index: number) => `${idPrefix}${meal.id}-${item.id ?? index}-`;

  const el = h("div", { class: className },
    h("label", null, "Name", name),
    h("label", { class: "editor-description-field" }, "Description", description),
    totalField({ label: "Calories", value: meal.calories, onChange: (calories) => onChange({ calories }) }),
    totalField({ label: "Protein", value: meal.protein, onChange: (protein) => onChange({ protein }) }),
    totalField({ label: "Carbs", value: meal.carbs ?? 0, onChange: (carbs) => onChange({ carbs }) }),
    totalField({ label: "Fat", value: meal.fat ?? 0, onChange: (fat) => onChange({ fat }) }),
    h("label", { class: "editor-photo-field" }, hasSavedPhoto ? "Replace photo (optional)" : "Photo (optional)", h("input", {
      type: "file",
      accept: mealPhotoAccept,
      onchange: (event: Event) => {
        const input = event.target as HTMLInputElement;
        const photo = input.files?.[0] ?? null;
        const photoError = photo ? mealPhotoError(photo) : null;
        if (photoError) {
          input.value = "";
          onPhotoError(photoError);
          return;
        }
        onPhotoError(null);
        onPhotoChange(photo);
      },
    }), photoHint),
    h("label", { class: "editor-type-field" }, "Type", kind),
    h("div", { class: "meal-item-editors" },
      h("div", { class: "meal-item-editors-heading" }, h("strong", null, "Food item nutrition"), h("span", null, itemsHint)),
      meal.items.map((item, index) => h("div", { class: "meal-item-editor" },
        h("div", { class: "meal-item-editor-heading" }, h("strong", null, item.name), h("span", null, `${item.quantity ?? 1}${item.unit ? ` ${item.unit}` : " serving"}`)),
        mealNutritionEditor({
          values: item.nutrients ?? {},
          provenance: item.nutrientProvenance ?? {},
          onChange: (key, value) => onItemChange(item.id, index, key, value),
          onProvenanceChange: (key, origin) => onItemProvenanceChange(item.id, index, key, origin),
          idPrefix: itemPrefix(item, index),
          namePrefix: itemPrefix(item, index),
        }),
      )),
    ),
    h("div", { class: "editor-actions" },
      h("button", { class: "cancel-button", type: "button", onclick: onCancel }, "Cancel"),
      save,
    ),
  );

  function setUnlessFocused(field: HTMLInputElement | HTMLSelectElement | null, value: string) {
    if (field && field !== document.activeElement && field.value !== value) field.value = value;
  }

  return {
    el,
    sync({ disabled, saving, photoName }) {
      for (const control of el.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button")) control.disabled = disabled;
      save.setAttribute("aria-busy", String(saving));
      save.textContent = saving ? "Saving…" : "Save changes";
      photoHint.textContent = photoName ?? (hasSavedPhoto ? "Current photo stays unless you select a replacement." : "JPEG, PNG, or WebP · up to 10 MB");
    },
    refresh(draft) {
      setUnlessFocused(name, draft.name);
      setUnlessFocused(description, draft.description);
      setUnlessFocused(kind, draft.kind ?? "");
      draft.items.forEach((item, index) => {
        const prefix = itemPrefix(item, index);
        for (const [key, value] of Object.entries(item.nutrients ?? {})) {
          setUnlessFocused(el.querySelector<HTMLInputElement>(`#${CSS.escape(`${prefix}${key}`)}`), value === null || value === undefined ? "" : String(value));
        }
        for (const origin of el.querySelectorAll<HTMLSelectElement>(`select[id^="${CSS.escape(prefix)}"]`)) {
          const key = origin.id.slice(prefix.length, -"-origin".length) as NutrientKey;
          setUnlessFocused(origin, item.nutrientProvenance?.[key] ?? "");
        }
      });
    },
  };
}
