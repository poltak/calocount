import { aggregateNutrients } from "@app/common/features/entries/utils/nutrients";
import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";
import { formatNumber } from "../utils/dashboard-format.js";
import { dayTotals } from "../utils/entry-view.js";
import { useDashboard } from "./dashboard-context.js";
import { NutrientStat } from "./nutrient-stat.js";
import { NutrientTrendPanel } from "./nutrient-trend-panel.js";

const HIGHLIGHT_KEYS: NutrientKey[] = [
  "fiberG",
  "totalSugarsG",
  "saturatedFatG",
  "sodiumMg",
  "potassiumMg",
  "caffeineMg",
];
const VITAMIN_KEYS: NutrientKey[] = [
  "vitaminAMcgRae",
  "vitaminCMg",
  "vitaminDMcg",
  "vitaminEMg",
  "vitaminKMcg",
  "vitaminB6Mg",
  "folateMcgDfe",
  "vitaminB12Mcg",
];
const MINERAL_KEYS: NutrientKey[] = [
  "sodiumMg",
  "potassiumMg",
  "calciumMg",
  "ironMg",
  "magnesiumMg",
  "phosphorusMg",
  "zincMg",
  "seleniumMcg",
];
const FAT_PROFILE: [NutrientKey, string][] = [
  ["saturatedFatG", "Saturated fat"],
  ["monounsaturatedFatG", "Monounsaturated"],
  ["polyunsaturatedFatG", "Polyunsaturated"],
];

function PanelHeading({
  eyebrow,
  title,
  id,
  meta,
}: {
  eyebrow: string;
  title: string;
  id: string;
  meta: string;
}) {
  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
      </div>
      <span className="panel-meta">{meta}</span>
    </div>
  );
}

function MacroDetail({ label, grams }: { label: string; grams: number }) {
  return (
    <div className="nutrient-stat">
      <span className="nutrient-stat-label">{label}</span>
      <span className="nutrient-value">
        <span className="nutrient-value-reading">
          <strong>{formatNumber(grams)}</strong>
          <small>g</small>
        </span>
      </span>
    </div>
  );
}

/** The nutrients of the day in view. The owner can fold the section away. */
export function NutritionOverview() {
  const { dashboard } = useDashboard();
  const { logic, state } = dashboard;
  const totals = dayTotals(state.entries);
  const nutrients = aggregateNutrients(
    state.entries.flatMap((entry) => entry.items.map((item) => item.nutrients)),
  );
  const collapsed = state.nutritionCollapsed;
  return (
    <section
      className="nutrition-overview"
      id="nutrition"
      aria-labelledby="nutrition-title"
    >
      <div className="nutrition-overview-heading">
        <div>
          <p className="eyebrow">Detailed view</p>
          <h2 id="nutrition-title">Nutrition details</h2>
        </div>
        <div className="nutrition-overview-actions">
          <button
            type="button"
            className="nutrition-section-toggle"
            aria-expanded={!collapsed}
            aria-controls="nutrition-details-content"
            onClick={() => logic.toggleNutritionSection()}
          >
            {collapsed ? "Show details" : "Hide details"}
            <span aria-hidden="true">{collapsed ? "⌄" : "⌃"}</span>
          </button>
        </div>
      </div>

      <div
        className="nutrition-overview-content"
        id="nutrition-details-content"
        hidden={collapsed}
      >
        <section
          className="panel nutrition-highlights"
          aria-labelledby="nutrition-overview-title"
        >
          <PanelHeading
            eyebrow="High-signal values"
            title="Nutrition overview"
            id="nutrition-overview-title"
            meta="absolute amounts"
          />
          <div className="nutrition-highlight-grid">
            {HIGHLIGHT_KEYS.map((key) => (
              <NutrientStat
                key={key}
                className="nutrition-highlight"
                nutrientKey={key}
                total={nutrients[key]}
              />
            ))}
          </div>
        </section>

        <div className="nutrition-detail-grid">
          <section
            className="panel nutrient-group-panel"
            aria-labelledby="carbohydrate-details-title"
          >
            <PanelHeading
              eyebrow="Breakdown"
              title="Carbohydrate details"
              id="carbohydrate-details-title"
              meta="per day"
            />
            <div className="nutrient-stat-grid nutrient-stat-grid-compact">
              <MacroDetail label="Total carbohydrates" grams={totals.carbs} />
              <NutrientStat
                nutrientKey="fiberG"
                label="Fibre"
                total={nutrients.fiberG}
                showCoverage={false}
              />
              <NutrientStat
                nutrientKey="totalSugarsG"
                label="Total sugars"
                total={nutrients.totalSugarsG}
                showCoverage={false}
              />
            </div>
          </section>

          <section
            className="panel nutrient-group-panel"
            aria-labelledby="fat-profile-title"
          >
            <PanelHeading
              eyebrow="Breakdown"
              title="Fat profile"
              id="fat-profile-title"
              meta="omega-3 is nested"
            />
            <div className="nutrient-stat-grid nutrient-stat-grid-compact">
              <MacroDetail label="Total fat" grams={totals.fat} />
              {FAT_PROFILE.map(([key, label]) => (
                <NutrientStat
                  key={key}
                  nutrientKey={key}
                  label={label}
                  total={nutrients[key]}
                  showCoverage={false}
                />
              ))}
              <NutrientStat
                className="nutrient-stat-nested"
                nutrientKey="omega3G"
                label="Omega-3 · part of polyunsaturated"
                total={nutrients.omega3G}
                showCoverage={false}
              />
            </div>
          </section>
        </div>

        <div className="nutrition-detail-grid nutrition-groups-grid">
          {[
            { id: "vitamins", title: "Vitamins", keys: VITAMIN_KEYS },
            { id: "minerals", title: "Minerals", keys: MINERAL_KEYS },
          ].map(({ id, title, keys }) => (
            <section
              key={id}
              className="panel nutrient-group-panel"
              id={id}
              aria-labelledby={`${id}-title`}
            >
              <PanelHeading
                eyebrow="Micronutrients"
                title={title}
                id={`${id}-title`}
                meta="amounts"
              />
              <div className="nutrient-stat-grid">
                {keys.map((key) => (
                  <NutrientStat
                    key={key}
                    nutrientKey={key}
                    total={nutrients[key]}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <NutrientTrendPanel />
      </div>
    </section>
  );
}
