"use client";

import { useState } from "react";

import type { NutrientKey, NutrientUpperLimitKey } from "../domain/nutrients";
import type { NutrientValueOrigin } from "../domain/nutrient-provenance";
import type { MealDraftChanges } from "./dashboard-edit";
import type { NutritionItem } from "./nutrition/meal-nutrition-details";
import { MealNutritionEditor } from "./nutrition/meal-nutrition-editor";

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
  photoKey?: string | null;
  items: NutritionItem[];
};

type MealEditorProps = {
  /** The draft being edited. */
  meal: EditorMeal;
  className?: string;
  /** Distinguishes field IDs when two editors could exist for the same entry. */
  idPrefix: string;
  itemsHint: string;
  /** The name of a photo chosen in this editor but not saved yet. */
  photoName: string | null;
  disabled: boolean;
  saving: boolean;
  onChange: (changes: MealDraftChanges) => void;
  onItemChange: (itemId: string | undefined, itemIndex: number, key: NutrientKey | NutrientUpperLimitKey, value: number | null) => void;
  onItemProvenanceChange: (itemId: string | undefined, itemIndex: number, key: NutrientKey, origin: NutrientValueOrigin | null) => void;
  onPhotoChange: (photo: File | null) => void;
  onPhotoError: (message: string | null) => void;
  onCancel: () => void;
  onSave: () => void;
};

/** A number input that can be emptied while typing. An empty field counts as zero. */
function TotalField({ label, value, disabled, onChange }: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(() => String(value));
  return <label>{label}<input
    type="number"
    min="0"
    step="any"
    value={text}
    disabled={disabled}
    onChange={(event) => {
      setText(event.target.value);
      const parsed = Number(event.target.value);
      onChange(Number.isFinite(parsed) ? parsed : 0);
    }}
  /></label>;
}

/** The edit form for one entry: its totals, photo and per-item nutrition. */
export function MealEditor({
  meal,
  className = "inline-editor",
  idPrefix,
  itemsHint,
  photoName,
  disabled,
  saving,
  onChange,
  onItemChange,
  onItemProvenanceChange,
  onPhotoChange,
  onPhotoError,
  onCancel,
  onSave,
}: MealEditorProps) {
  return <div className={className}>
    <label>Name<input value={meal.name} disabled={disabled} onChange={(event) => onChange({ name: event.target.value })} /></label>
    <label className="editor-description-field">Description<input value={meal.description} disabled={disabled} onChange={(event) => onChange({ description: event.target.value })} /></label>
    <TotalField label="Calories" value={meal.calories} disabled={disabled} onChange={(calories) => onChange({ calories })} />
    <TotalField label="Protein" value={meal.protein} disabled={disabled} onChange={(protein) => onChange({ protein })} />
    <TotalField label="Carbs" value={meal.carbs ?? 0} disabled={disabled} onChange={(carbs) => onChange({ carbs })} />
    <TotalField label="Fat" value={meal.fat ?? 0} disabled={disabled} onChange={(fat) => onChange({ fat })} />
    <label className="editor-photo-field">{meal.photoKey ? "Replace photo (optional)" : "Photo (optional)"}<input
      type="file"
      accept={mealPhotoAccept}
      disabled={disabled}
      onChange={(event) => {
        const photo = event.target.files?.[0] ?? null;
        const photoError = photo ? mealPhotoError(photo) : null;
        if (photoError) {
          event.target.value = "";
          onPhotoError(photoError);
          return;
        }
        onPhotoError(null);
        onPhotoChange(photo);
      }}
    /><small>{photoName ?? (meal.photoKey ? "Current photo stays unless you select a replacement." : "JPEG, PNG, or WebP · up to 10 MB")}</small></label>
    <div className="meal-item-editors">
      <div className="meal-item-editors-heading"><strong>Food item nutrition</strong><span>{itemsHint}</span></div>
      {meal.items.map((item, index) => <div className="meal-item-editor" key={item.id ?? `${meal.id}-item-${index}`}>
        <div className="meal-item-editor-heading"><strong>{item.name}</strong><span>{item.quantity ?? 1}{item.unit ? ` ${item.unit}` : " serving"}</span></div>
        <MealNutritionEditor
          values={item.nutrients ?? {}}
          provenance={item.nutrientProvenance}
          onChange={(key, value) => onItemChange(item.id, index, key, value)}
          onProvenanceChange={(key, origin) => onItemProvenanceChange(item.id, index, key, origin)}
          idPrefix={`${idPrefix}${meal.id}-${item.id ?? index}-`}
          namePrefix={`${idPrefix}${meal.id}-${item.id ?? index}-`}
          disabled={disabled}
        />
      </div>)}
    </div>
    <div className="editor-actions">
      <button className="cancel-button" type="button" disabled={disabled} onClick={onCancel}>Cancel</button>
      <button className="done-button" type="button" disabled={disabled} aria-busy={saving} onClick={onSave}>{saving ? "Saving…" : "Save changes"}</button>
    </div>
  </div>;
}
