import { h } from "./dom";
import { nutrientValueOriginLabel, type NutrientProvenanceMap } from "../../domain/nutrient-provenance";
import { NUTRIENT_UPPER_LIMIT_META } from "../../domain/nutrients";
import { aggregateNutrientValues, nutrientLabel, nutrientKeys } from "../nutrition/nutrient-meta";
import type { NutritionItem, NutritionMeal } from "../nutrition/nutrition-item";
import { nutrientValueText } from "./nutrient-value";

type MealNutritionDetailsProps = {
  meal: NutritionMeal;
  open: boolean;
  /** Called with the click on the button. The button is a child of the element that this function returns. */
  onToggle: (event: Event) => void;
};

function itemValue(item: NutritionItem, key: string) {
  const value = item.nutrients?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function itemOrigin(item: NutritionItem, key: string) {
  return item.nutrientProvenance?.[key as keyof NutrientProvenanceMap];
}

function amount(value: number) {
  return value.toLocaleString("en-US");
}

function macroLine(className: string, { calories, protein, carbs, fat }: { calories: number; protein: number; carbs: number; fat: number }) {
  return h("div", { class: className },
    h("span", null, `${amount(calories)} kcal`),
    h("span", null, `${amount(protein)}g protein`),
    h("span", null, `${amount(carbs)}g carbs`),
    h("span", null, `${amount(fat)}g fat`),
  );
}

function itemDetail(item: NutritionItem) {
  const upperLimitValues = NUTRIENT_UPPER_LIMIT_META.filter(({ key }) => itemValue(item, key) !== null);
  const hasConfidence = item.confidence !== null && item.confidence !== undefined;
  return h("article", { class: "meal-item-detail" },
    h("div", { class: "meal-item-heading" }, h("strong", null, item.name), h("span", null, `${item.quantity ?? 1}${item.unit ? ` ${item.unit}` : " serving"}`)),
    macroLine("meal-item-macros", { calories: item.calories ?? 0, protein: item.proteinG ?? 0, carbs: item.carbsG ?? 0, fat: item.fatG ?? 0 }),
    h("div", { class: "meal-item-nutrients" }, nutrientKeys.map((key) => {
      const value = itemValue(item, key);
      return h("span", null,
        h("b", null, nutrientLabel(key)), " ", nutrientValueText({ nutrientKey: key, value }),
        value !== null ? h("small", { class: "meal-item-provenance" }, nutrientValueOriginLabel(itemOrigin(item, key))) : null,
      );
    })),
    upperLimitValues.length ? h("div", { class: "meal-item-upper-limit-details" },
      h("strong", null, "Recorded form and source amounts"),
      h("div", { class: "meal-item-nutrients" }, upperLimitValues.map(({ key, label, unit }) => h("span", null, h("b", null, label), ` ${itemValue(item, key)?.toLocaleString("en-US")} ${unit}`))),
    ) : null,
    item.source || hasConfidence ? h("small", { class: "meal-item-source" },
      [item.source ? `Source: ${item.source}` : null, hasConfidence ? `Confidence: ${item.confidence}` : null].filter(Boolean).join(" · "),
    ) : null,
  );
}

/** The button that shows the nutrients of one entry, and the card it opens. The dashboard keeps the open state. */
export function mealNutritionDetails({ meal, open, onToggle }: MealNutritionDetailsProps) {
  if (!open) {
    return h("div", { class: "meal-nutrition-details" },
      h("button", { type: "button", class: "nutrition-details-button", "aria-expanded": false, onclick: onToggle }, "Nutrition details"),
    );
  }
  const aggregates = aggregateNutrientValues(meal.items.map((item) => item.nutrients ?? {}));
  return h("div", { class: "meal-nutrition-details" },
    h("button", { type: "button", class: "nutrition-details-button", "aria-expanded": true, onclick: onToggle }, "Hide nutrition details"),
    h("div", { class: "meal-nutrition-detail-card" },
      h("div", { class: "meal-nutrition-detail-heading" },
        h("div", null, h("strong", null, meal.name), h("span", null, meal.description || "Entry nutrition")),
        h("span", null, `${meal.items.length} item${meal.items.length === 1 ? "" : "s"}`),
      ),
      macroLine("meal-nutrition-macros", { calories: meal.calories, protein: meal.protein, carbs: meal.carbs ?? 0, fat: meal.fat ?? 0 }),
      h("div", { class: "meal-nutrition-total-grid" }, nutrientKeys.map((key) => {
        const aggregate = aggregates[key];
        return h("div", { class: "nutrient-stat" },
          h("span", { class: "nutrient-stat-label" }, nutrientLabel(key)),
          h("span", { class: "nutrient-value" },
            h("strong", null, nutrientValueText({ nutrientKey: key, aggregate })),
            aggregate && !aggregate.complete && aggregate.amount !== null ? h("em", null, "Partial") : null,
          ),
        );
      })),
      h("div", { class: "meal-items-list" },
        h("h3", null, "Food items"),
        meal.items.length ? meal.items.map(itemDetail) : h("p", { class: "meal-item-empty" }, "No item breakdown is available for this entry."),
      ),
    ),
  );
}
