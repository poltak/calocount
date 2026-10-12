import { cx, h } from "./dom";
import {
  nutrientLabel,
  type NutrientAggregateMap,
  type NutrientGoalMap,
  type NutrientKey,
  type NutrientValueMap,
} from "../nutrition/nutrient-meta";
import { nutrientStat } from "./nutrient-stat";

type NutrientGroupProps = {
  title: string;
  nutrientKeys: readonly NutrientKey[];
  values?: NutrientAggregateMap | NutrientValueMap;
  goals?: NutrientGoalMap;
  id?: string;
  eyebrow?: string;
  className?: string;
};

function aggregateFor(values: NutrientAggregateMap | NutrientValueMap | undefined, key: NutrientKey) {
  const value = values?.[key];
  if (!value || typeof value !== "object" || !("amount" in value)) return { value: value as number | null | undefined, aggregate: null };
  return { value: undefined, aggregate: value };
}

export function nutrientGroup({ title, nutrientKeys, values, goals, id, eyebrow = "Nutrition", className = "" }: NutrientGroupProps) {
  return h("section", { class: cx("panel nutrient-group-panel", className), id, "aria-labelledby": id ? `${id}-title` : undefined },
    h("div", { class: "panel-heading" },
      h("div", null, h("p", { class: "eyebrow" }, eyebrow), h("h2", { id: id ? `${id}-title` : undefined }, title)),
      h("span", { class: "panel-meta" }, "amounts"),
    ),
    h("div", { class: "nutrient-stat-grid" },
      nutrientKeys.map((key) => {
        const selected = aggregateFor(values, key);
        return nutrientStat({ nutrientKey: key, label: nutrientLabel(key), value: selected.value, aggregate: selected.aggregate, goal: goals?.[key] });
      }),
    ),
  );
}
