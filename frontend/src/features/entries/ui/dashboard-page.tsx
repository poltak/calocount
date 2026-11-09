import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import { cx } from "../utils/class-names.js";
import { CalorieTrendPanel } from "./calorie-trend-panel.js";
import { DashboardProvider, useDashboard } from "./dashboard-context.js";
import { DashboardTopbar } from "./dashboard-topbar.js";
import { DateStrip } from "./date-strip.js";
import { MacroPanel } from "./macro-panel.js";
import { MealsPanel } from "./meals-panel.js";
import { NutritionOverview } from "./nutrition-overview.js";
import { SavedEntriesPanel } from "./saved-entries-panel.js";
import { SectionTabs } from "./section-tabs.js";
import { SummaryGrid } from "./summary-grid.js";

function Feedback() {
  const { dashboard, form, actions } = useDashboard();
  const { state } = dashboard;
  const error =
    form.state.addEntryError ??
    form.state.saveEntryError ??
    actions.state.actError ??
    state.loadDayError ??
    (state.loaded ? state.loadDashboardError : null);
  const message = error ?? state.statusMessage;
  if (!message) {
    return null;
  }
  return (
    <div
      className={cx("action-feedback", error && "error")}
      role={error ? "alert" : "status"}
      aria-live="polite"
    >
      {message}
    </div>
  );
}

function LoadingState() {
  const { dashboard } = useDashboard();
  const { loadDashboardState, loadDashboardError } = dashboard.state;
  const failed = loadDashboardState === "error";
  return (
    <section className="dashboard-state" aria-live="polite">
      <span className="dashboard-state-mark" aria-hidden="true">
        {failed ? "!" : "…"}
      </span>
      <h1>
        {failed ? "Your dashboard is unavailable" : "Loading your saved log"}
      </h1>
      <p>
        {failed
          ? (loadDashboardError ??
            "Your saved log is unavailable. Try again later.")
          : "Loading your saved log…"}
      </p>
      {failed && (
        <button
          className="primary-button"
          type="button"
          onClick={() => void dashboard.logic.loadDashboard()}
        >
          Try again
        </button>
      )}
    </section>
  );
}

function DashboardView({
  topbarActions,
  belowTopbar,
}: {
  topbarActions: ReactNode;
  belowTopbar: ReactNode;
}) {
  const { dashboard } = useDashboard();
  const { logic, state } = dashboard;
  const { hash } = useLocation();
  useEffect(() => {
    logic.setActiveSection({ hash });
  }, [logic, hash]);

  return (
    <>
      <DashboardTopbar actions={topbarActions} />
      {belowTopbar}
      <Feedback />
      {state.loaded ? (
        <>
          <DateStrip />
          <SectionTabs />
          <SummaryGrid />
          <div className="content-grid">
            <section className="primary-column">
              <CalorieTrendPanel />
              <NutritionOverview />
              <MacroPanel />
              <SavedEntriesPanel />
              <MealsPanel />
            </section>
          </div>
        </>
      ) : (
        <LoadingState />
      )}
      <footer className="app-footer">
        <span>Private by default</span>
        <span className="footer-separator" aria-hidden="true">
          ·
        </span>
        <span>Calocount dashboard</span>
      </footer>
    </>
  );
}

/**
 * The owner dashboard at `/owner`. Other features own the settings button and
 * the dialog that it opens, so the route gives them in.
 */
export function DashboardPage({
  topbarActions,
  belowTopbar,
}: {
  topbarActions: ReactNode;
  belowTopbar: ReactNode;
}) {
  return (
    <DashboardProvider>
      <DashboardView topbarActions={topbarActions} belowTopbar={belowTopbar} />
    </DashboardProvider>
  );
}
