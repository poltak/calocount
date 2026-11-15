import {
  aggregateNutrients,
  NUTRIENT_KEYS,
} from "@app/common/features/entries/utils/nutrients";
import { nutrientValueOriginLabel } from "@app/common/features/entries/utils/nutrient-provenance";
import type { EntryView, ItemView } from "../utils/entry-view.js";
import {
  nutrientLabel,
  nutrientValueText,
} from "../../core/utils/nutrient-format.js";
import { NutrientStat } from "./nutrient-stat.js";

function amount(value: number): string {
  return value.toLocaleString("en-US");
}

function MacroLine({
  className,
  calories,
  protein,
  carbs,
  fat,
}: {
  className: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}) {
  return (
    <div className={className}>
      <span>{`${amount(calories)} kcal`}</span>
      <span>{`${amount(protein)}g protein`}</span>
      <span>{`${amount(carbs)}g carbs`}</span>
      <span>{`${amount(fat)}g fat`}</span>
    </div>
  );
}

function ItemDetail({ item }: { item: ItemView }) {
  const hasConfidence = item.confidence !== null;
  return (
    <article className="meal-item-detail">
      <div className="meal-item-heading">
        <strong>{item.name}</strong>
        <span>{`${item.quantity}${item.unit ? ` ${item.unit}` : " serving"}`}</span>
      </div>
      <MacroLine
        className="meal-item-macros"
        calories={item.calories}
        protein={item.proteinG}
        carbs={item.carbsG}
        fat={item.fatG}
      />
      <div className="meal-item-nutrients">
        {NUTRIENT_KEYS.map((key) => {
          const value = item.nutrients[key] ?? null;
          return (
            <span key={key}>
              <b>{nutrientLabel(key)}</b>
              {` ${nutrientValueText(value, key)}`}
              {value !== null && (
                <small className="meal-item-provenance">
                  {nutrientValueOriginLabel(item.nutrientProvenance[key])}
                </small>
              )}
            </span>
          );
        })}
      </div>
      {(item.source || hasConfidence) && (
        <small className="meal-item-source">
          {[
            item.source ? `Source: ${item.source}` : null,
            hasConfidence ? `Confidence: ${item.confidence}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </small>
      )}
    </article>
  );
}

/** The card that opens under an entry: its totals, the nutrients, and each food item. */
export function EntryNutritionDetails({ entry }: { entry: EntryView }) {
  const totals = aggregateNutrients(entry.items.map((item) => item.nutrients));
  return (
    <div className="meal-nutrition-detail-card">
      <div className="meal-nutrition-detail-heading">
        <div>
          <strong>{entry.name}</strong>
          <span>{entry.description || "Entry nutrition"}</span>
        </div>
        <span>{`${entry.items.length} item${entry.items.length === 1 ? "" : "s"}`}</span>
      </div>
      <MacroLine
        className="meal-nutrition-macros"
        calories={entry.calories}
        protein={entry.protein}
        carbs={entry.carbs}
        fat={entry.fat}
      />
      <div className="meal-nutrition-total-grid">
        {NUTRIENT_KEYS.map((key) => (
          <NutrientStat key={key} nutrientKey={key} total={totals[key]} />
        ))}
      </div>
      <div className="meal-items-list">
        <h3>Food items</h3>
        {entry.items.length > 0 ? (
          entry.items.map((item, index) => (
            <ItemDetail key={item.id ?? index} item={item} />
          ))
        ) : (
          <p className="meal-item-empty">
            No item breakdown is available for this entry.
          </p>
        )}
      </div>
    </div>
  );
}
