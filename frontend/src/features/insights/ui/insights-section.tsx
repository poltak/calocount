import { CollapsibleSection } from "../../core/ui/collapsible-section.js";
import { DaysWorthRepeatingPanel } from "./days-worth-repeating-panel.js";
import { FoodSourcesPanel } from "./food-sources-panel.js";
import { InsightsProvider, useInsights } from "./insights-context.js";
import { NutritionAttentionPanel } from "./nutrition-attention-panel.js";
import { WeeklyChangesPanel } from "./weekly-changes-panel.js";
import type { InsightsSlotProps } from "../types.js";

function InsightsView() {
  const { logic, state } = useInsights();
  const { collapsed, loaded, loadError } = state;
  return (
    <CollapsibleSection
      className="insights-overview"
      title="Insights"
      description="Food sources, nutrition attention, days worth repeating and weekly changes"
      expanded={!collapsed}
      controls="insights-content"
      onToggle={() => logic.toggleCollapsed()}
      notice={
        loadError && (
          <div className="action-feedback error" role="alert">
            {loadError}
          </div>
        )
      }
    >
      {loaded && (
        <div className="insights-content">
          <div className="nutrition-insights-content">
            <FoodSourcesPanel />
            <NutritionAttentionPanel />
          </div>
          <div className="insights-overview-content">
            <DaysWorthRepeatingPanel />
            <WeeklyChangesPanel />
          </div>
        </div>
      )}
    </CollapsibleSection>
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
