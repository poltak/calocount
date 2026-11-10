import { DaysWorthRepeatingPanel } from "./days-worth-repeating-panel.js";
import { FrequencyPortionPanel } from "./frequency-portion-panel.js";
import { InsightsProvider, useInsights } from "./insights-context.js";
import { NutrientFoodInsights } from "./nutrient-food-insights.js";
import { NutritionAttentionPanel } from "./nutrition-attention-panel.js";
import { WeeklyChangesPanel } from "./weekly-changes-panel.js";
import type { InsightsSlotProps } from "../types.js";

function InsightsView() {
  const { logic, state } = useInsights();
  const { collapsed, loaded, loadError } = state;
  return (
    <section className="insights-overview" aria-labelledby="insights-title">
      <div className="nutrition-overview-heading insights-overview-heading">
        <div>
          <p className="eyebrow">Longer-term patterns</p>
          <h2 id="insights-title">Insights</h2>
        </div>
        <div className="nutrition-overview-actions">
          <span className="panel-meta">historical patterns</span>
          <button
            type="button"
            className="nutrition-section-toggle"
            aria-expanded={!collapsed}
            aria-controls="nutrition-insights-content insights-overview-content"
            onClick={() => logic.toggleCollapsed()}
          >
            {collapsed ? "Show insights" : "Hide insights"}
            <span aria-hidden="true">{collapsed ? "⌄" : "⌃"}</span>
          </button>
        </div>
      </div>
      {loadError && (
        <div className="action-feedback error" role="alert">
          {loadError}
        </div>
      )}
      {loaded && (
        <>
          <div
            className="nutrition-insights-content"
            id="nutrition-insights-content"
            hidden={collapsed}
          >
            <NutritionAttentionPanel />
            <NutrientFoodInsights />
          </div>
          <div
            className="insights-overview-content"
            id="insights-overview-content"
            hidden={collapsed}
          >
            <DaysWorthRepeatingPanel />
            <WeeklyChangesPanel />
            <FrequencyPortionPanel />
          </div>
        </>
      )}
    </section>
  );
}

/** The insight panels below the entries of the owner dashboard. */
export function InsightsSection(props: InsightsSlotProps) {
  return (
    <InsightsProvider {...props}>
      <InsightsView />
    </InsightsProvider>
  );
}
