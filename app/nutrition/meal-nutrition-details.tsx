import { useState } from "react";

import { aggregateNutrientValues, nutrientLabel, nutrientKeys, type NutrientValueMap } from "./nutrient-meta";
import { NutrientValueText } from "./nutrient-value";

export type NutritionItem = {
  id?: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  nutrients?: NutrientValueMap;
  source?: string | null;
  confidence?: string | number | null;
};

export type NutritionMeal = {
  id: string;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs?: number | null;
  fat?: number | null;
  photoUrl?: string | null;
  items: NutritionItem[];
};

type MealNutritionDetailsProps = {
  meal: NutritionMeal;
  readOnly?: boolean;
};

function itemValue(item: NutritionItem, key: string) {
  const value = item.nutrients?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function MealNutritionDetails({ meal }: MealNutritionDetailsProps) {
  const [open, setOpen] = useState(false);
  const aggregates = aggregateNutrientValues(meal.items.map((item) => item.nutrients ?? {}));
  return <div className="meal-nutrition-details">
    <button type="button" className="nutrition-details-button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{open ? "Hide nutrition details" : "Nutrition details"}</button>
    {open ? <div className="meal-nutrition-detail-card">
      <div className="meal-nutrition-detail-heading"><div><strong>{meal.name}</strong><span>{meal.description || "Meal nutrition"}</span></div><span>{meal.items.length} item{meal.items.length === 1 ? "" : "s"}</span></div>
      <div className="meal-nutrition-macros"><span>{meal.calories.toLocaleString("en-US")} kcal</span><span>{meal.protein.toLocaleString("en-US")}g protein</span><span>{(meal.carbs ?? 0).toLocaleString("en-US")}g carbs</span><span>{(meal.fat ?? 0).toLocaleString("en-US")}g fat</span></div>
      <div className="meal-nutrition-total-grid">
        {nutrientKeys.map((key) => <div className="nutrient-stat" key={key}><span className="nutrient-stat-label">{nutrientLabel(key)}</span><span className="nutrient-value"><strong><NutrientValueText nutrientKey={key} aggregate={aggregates[key]} /></strong>{aggregates[key] && !aggregates[key].complete && aggregates[key].amount !== null ? <em>Partial</em> : null}</span></div>)}
      </div>
      <div className="meal-items-list"><h3>Food items</h3>{meal.items.length ? meal.items.map((item, index) => <article className="meal-item-detail" key={item.id ?? `${item.name}-${index}`}>
        <div className="meal-item-heading"><strong>{item.name}</strong><span>{item.quantity ?? 1}{item.unit ? ` ${item.unit}` : " serving"}</span></div>
        <div className="meal-item-macros"><span>{(item.calories ?? 0).toLocaleString("en-US")} kcal</span><span>{(item.proteinG ?? 0).toLocaleString("en-US")}g protein</span><span>{(item.carbsG ?? 0).toLocaleString("en-US")}g carbs</span><span>{(item.fatG ?? 0).toLocaleString("en-US")}g fat</span></div>
        <div className="meal-item-nutrients">{nutrientKeys.map((key) => <span key={key}><b>{nutrientLabel(key)}</b> <NutrientValueText nutrientKey={key} value={itemValue(item, key)} /></span>)}</div>
        {item.source || item.confidence !== null && item.confidence !== undefined ? <small className="meal-item-source">{item.source ? `Source: ${item.source}` : null}{item.source && item.confidence !== null && item.confidence !== undefined ? " · " : null}{item.confidence !== null && item.confidence !== undefined ? `Confidence: ${item.confidence}` : null}</small> : null}
      </article>) : <p className="meal-item-empty">No item breakdown is available for this meal.</p>}</div>
    </div> : null}
  </div>;
}
