import { h, type Child } from "./dom";
import { nutrientGroup } from "./nutrient-group";
import { type NutrientAggregateMap, type NutrientGoalMap, type NutrientKey } from "../nutrition/nutrient-meta";
import { nutrientStat } from "./nutrient-stat";
import { nutrientValue } from "./nutrient-value";

type NutritionOverviewProps = {
  values?: NutrientAggregateMap;
  carbsG?: number | null;
  fatG?: number | null;
  goals?: NutrientGoalMap;
  collapsed: boolean;
  onToggle: () => void;
  children?: Child;
};

const overviewKeys = ["fiberG", "totalSugarsG", "saturatedFatG", "sodiumMg", "potassiumMg", "caffeineMg"] satisfies NutrientKey[];
const vitaminKeys = ["vitaminAMcgRae", "vitaminCMg", "vitaminDMcg", "vitaminEMg", "vitaminKMcg", "vitaminB6Mg", "folateMcgDfe", "vitaminB12Mcg"] satisfies NutrientKey[];
const mineralKeys = ["sodiumMg", "potassiumMg", "calciumMg", "ironMg", "magnesiumMg", "phosphorusMg", "zincMg", "seleniumMcg"] satisfies NutrientKey[];
const fatProfile = [["saturatedFatG", "Saturated fat"], ["monounsaturatedFatG", "Monounsaturated"], ["polyunsaturatedFatG", "Polyunsaturated"]] satisfies [NutrientKey, string][];

function amountFor(values: NutrientAggregateMap | undefined, key: NutrientKey) {
  return values?.[key] ?? null;
}

function macroDetail({ nutrientKey, label, value }: { nutrientKey: string; label: string; value?: number | null }) {
  return h("div", { class: "nutrient-stat" },
    h("span", { class: "nutrient-stat-label" }, label),
    nutrientValue({ nutrientKey, value, showLabel: false }),
  );
}

function panelHeading({ eyebrow, title, titleId, meta }: { eyebrow: string; title: string; titleId: string; meta: string }) {
  return h("div", { class: "panel-heading" },
    h("div", null, h("p", { class: "eyebrow" }, eyebrow), h("h2", { id: titleId }, title)),
    h("span", { class: "panel-meta" }, meta),
  );
}

export function nutritionOverview({ values, carbsG, fatG, goals, collapsed, onToggle, children }: NutritionOverviewProps) {
  return h("section", { class: "nutrition-overview", id: "nutrition", "aria-labelledby": "nutrition-title" },
    h("div", { class: "nutrition-overview-heading" },
      h("div", null, h("p", { class: "eyebrow" }, "Detailed view"), h("h2", { id: "nutrition-title" }, "Nutrition details")),
      h("div", { class: "nutrition-overview-actions" },
        h("button", {
          type: "button",
          class: "nutrition-section-toggle",
          "aria-expanded": !collapsed,
          "aria-controls": "nutrition-details-content",
          onclick: onToggle,
        }, collapsed ? "Show details" : "Hide details", h("span", { "aria-hidden": "true" }, collapsed ? "⌄" : "⌃")),
      ),
    ),

    h("div", { class: "nutrition-overview-content", id: "nutrition-details-content", hidden: collapsed },
      h("section", { class: "panel nutrition-highlights", "aria-labelledby": "nutrition-overview-title" },
        panelHeading({ eyebrow: "High-signal values", title: "Nutrition overview", titleId: "nutrition-overview-title", meta: "absolute amounts" }),
        h("div", { class: "nutrition-highlight-grid" },
          overviewKeys.map((key) => nutrientStat({ className: "nutrition-highlight", nutrientKey: key, aggregate: amountFor(values, key), goal: goals?.[key] })),
        ),
      ),

      h("div", { class: "nutrition-detail-grid" },
        h("section", { class: "panel nutrient-group-panel", "aria-labelledby": "carbohydrate-details-title" },
          panelHeading({ eyebrow: "Breakdown", title: "Carbohydrate details", titleId: "carbohydrate-details-title", meta: "per day" }),
          h("div", { class: "nutrient-stat-grid nutrient-stat-grid-compact" },
            macroDetail({ nutrientKey: "carbsG", label: "Total carbohydrates", value: carbsG }),
            nutrientStat({ nutrientKey: "fiberG", label: "Fibre", aggregate: amountFor(values, "fiberG"), goal: goals?.fiberG, showCoverage: false }),
            nutrientStat({ nutrientKey: "totalSugarsG", label: "Total sugars", aggregate: amountFor(values, "totalSugarsG"), goal: goals?.totalSugarsG, showCoverage: false }),
          ),
        ),

        h("section", { class: "panel nutrient-group-panel", "aria-labelledby": "fat-profile-title" },
          panelHeading({ eyebrow: "Breakdown", title: "Fat profile", titleId: "fat-profile-title", meta: "omega-3 is nested" }),
          h("div", { class: "nutrient-stat-grid nutrient-stat-grid-compact" },
            macroDetail({ nutrientKey: "fatG", label: "Total fat", value: fatG }),
            fatProfile.map(([key, label]) => nutrientStat({ nutrientKey: key, label, aggregate: amountFor(values, key), goal: goals?.[key], showCoverage: false })),
            nutrientStat({ className: "nutrient-stat-nested", nutrientKey: "omega3G", label: "Omega-3 · part of polyunsaturated", aggregate: amountFor(values, "omega3G"), goal: goals?.omega3G, showCoverage: false }),
          ),
        ),
      ),

      h("div", { class: "nutrition-detail-grid nutrition-groups-grid" },
        nutrientGroup({ title: "Vitamins", eyebrow: "Micronutrients", id: "vitamins", nutrientKeys: vitaminKeys, values, goals }),
        nutrientGroup({ title: "Minerals", eyebrow: "Micronutrients", id: "minerals", nutrientKeys: mineralKeys, values, goals }),
      ),

      children,
    ),
  );
}
