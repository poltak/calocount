import type { ReactNode } from "react";

import { NutrientGroup } from "./nutrient-group";
import { type NutrientAggregateMap, type NutrientGoalMap, type NutrientKey } from "./nutrient-meta";
import { NutrientStat } from "./nutrient-stat";
import { NutrientValue } from "./nutrient-value";

type NutritionOverviewProps = {
  values?: NutrientAggregateMap;
  carbsG?: number | null;
  fatG?: number | null;
  goals?: NutrientGoalMap;
  collapsed: boolean;
  onToggle: () => void;
  children?: ReactNode;
};

const overviewKeys = ["fiberG", "totalSugarsG", "saturatedFatG", "sodiumMg", "potassiumMg", "caffeineMg"] satisfies NutrientKey[];
const vitaminKeys = ["vitaminAMcgRae", "vitaminCMg", "vitaminDMcg", "vitaminEMg", "vitaminKMcg", "vitaminB6Mg", "folateMcgDfe", "vitaminB12Mcg"] satisfies NutrientKey[];
const mineralKeys = ["sodiumMg", "potassiumMg", "calciumMg", "ironMg", "magnesiumMg", "phosphorusMg", "zincMg", "seleniumMcg"] satisfies NutrientKey[];

function amountFor(values: NutrientAggregateMap | undefined, key: NutrientKey) {
  return values?.[key] ?? null;
}

function MacroDetail({ nutrientKey, label, value }: { nutrientKey: string; label: string; value?: number | null }) {
  return <div className="nutrient-stat">
    <span className="nutrient-stat-label">{label}</span>
    <NutrientValue nutrientKey={nutrientKey} value={value} showLabel={false} />
  </div>;
}

export function NutritionOverview({ values, carbsG, fatG, goals, collapsed, onToggle, children }: NutritionOverviewProps) {
  return <section className="nutrition-overview" id="nutrition" aria-labelledby="nutrition-title">
    <div className="nutrition-overview-heading">
      <div><p className="eyebrow">Detailed view</p><h2 id="nutrition-title">Nutrition</h2></div>
      <div className="nutrition-overview-actions">
        <span className="panel-meta">selected day</span>
        <button
          type="button"
          className="nutrition-section-toggle"
          aria-expanded={!collapsed}
          aria-controls="nutrition-details-content"
          onClick={onToggle}
        >
          {collapsed ? "Show details" : "Hide details"}
          <span aria-hidden="true">{collapsed ? "⌄" : "⌃"}</span>
        </button>
      </div>
    </div>

    <div className="nutrition-overview-content" id="nutrition-details-content" hidden={collapsed}>
      <section className="panel nutrition-highlights" aria-labelledby="nutrition-overview-title">
        <div className="panel-heading"><div><p className="eyebrow">High-signal values</p><h2 id="nutrition-overview-title">Nutrition overview</h2></div><span className="panel-meta">absolute amounts</span></div>
        <div className="nutrition-highlight-grid">
          {overviewKeys.map((key) => <NutrientStat className="nutrition-highlight" key={key} nutrientKey={key} aggregate={amountFor(values, key)} goal={goals?.[key]} />)}
        </div>
      </section>

      <div className="nutrition-detail-grid">
        <section className="panel nutrient-group-panel" aria-labelledby="carbohydrate-details-title">
          <div className="panel-heading"><div><p className="eyebrow">Breakdown</p><h2 id="carbohydrate-details-title">Carbohydrate details</h2></div><span className="panel-meta">per day</span></div>
          <div className="nutrient-stat-grid nutrient-stat-grid-compact">
            <MacroDetail nutrientKey="carbsG" label="Total carbohydrates" value={carbsG} />
            <NutrientStat nutrientKey="fiberG" label="Fibre" aggregate={amountFor(values, "fiberG")} goal={goals?.fiberG} showCoverage={false} />
            <NutrientStat nutrientKey="totalSugarsG" label="Total sugars" aggregate={amountFor(values, "totalSugarsG")} goal={goals?.totalSugarsG} showCoverage={false} />
          </div>
        </section>

        <section className="panel nutrient-group-panel" aria-labelledby="fat-profile-title">
          <div className="panel-heading"><div><p className="eyebrow">Breakdown</p><h2 id="fat-profile-title">Fat profile</h2></div><span className="panel-meta">omega-3 is nested</span></div>
          <div className="nutrient-stat-grid nutrient-stat-grid-compact">
            <MacroDetail nutrientKey="fatG" label="Total fat" value={fatG} />
            {([["saturatedFatG", "Saturated fat"], ["monounsaturatedFatG", "Monounsaturated"], ["polyunsaturatedFatG", "Polyunsaturated"]] satisfies [NutrientKey, string][]).map(([key, label]) => <NutrientStat nutrientKey={key} label={label} aggregate={amountFor(values, key)} goal={goals?.[key]} showCoverage={false} key={key} />)}
            <NutrientStat className="nutrient-stat-nested" nutrientKey="omega3G" label="Omega-3 · part of polyunsaturated" aggregate={amountFor(values, "omega3G")} goal={goals?.omega3G} showCoverage={false} />
          </div>
        </section>
      </div>

      <div className="nutrition-detail-grid nutrition-groups-grid">
        <NutrientGroup title="Vitamins" eyebrow="Micronutrients" id="vitamins" nutrientKeys={vitaminKeys} values={values} goals={goals} />
        <NutrientGroup title="Minerals" eyebrow="Micronutrients" id="minerals" nutrientKeys={mineralKeys} values={values} goals={goals} />
      </div>

      {children}
    </div>
  </section>;
}
