import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { fullDateLabel } from "../../core/utils/dashboard-format.js";
import type { InsightsSlotProps } from "../../insights/types.js";
import type { SettingsEvents } from "../../settings/types.js";
import type { WeightEvents } from "../../weights/types.js";
import type {
  CalendarSlotProps,
  EntryEvents,
  WeightSlotProps,
} from "../types.js";
import { cx } from "../../core/utils/class-names.js";
import { CalorieTrendPanel } from "./calorie-trend-panel.js";
import { DashboardProvider, useDashboard } from "./dashboard-context.js";
import { DashboardTopbar } from "./dashboard-topbar.js";
import { DateStrip } from "./date-strip.js";
import { MacroPanel } from "./macro-panel.js";
import { MacroTrendPanel } from "./macro-trend-panel.js";
import { MealsPanel } from "./meals-panel.js";
import { NutrientConsistencyPanel } from "./nutrient-consistency-panel.js";
import { NutritionOverview } from "./nutrition-overview.js";
import { PhotoPreview } from "./photo-preview.js";
import { ProteinTargetPanel } from "./protein-target-panel.js";
import { RecentDaysPanel } from "./recent-days-panel.js";
import { SavedEntriesPanel } from "./saved-entries-panel.js";
import { SectionTabs } from "./section-tabs.js";
import { SummaryGrid } from "./summary-grid.js";

/**
 * The insights read after the dashboard does, but the Logic that sends an
 * event waits only for the dashboard, so that its pending row goes with the
 * dashboard's read.
 */
function withoutWaiting(emitter: EntryEvents): EntryEvents {
  return {
    listen: (listener) =>
      emitter.listen((event) => {
        Promise.resolve(listener(event)).catch(() => undefined);
      }),
  };
}

function Feedback() {
  const { dashboard, form, actions } = useDashboard();
  const { state } = dashboard;
  const error =
    form.state.addEntryError ??
    form.state.saveEntryError ??
    actions.state.actError ??
    state.loadDayError ??
    (state.loaded ? state.loadDashboardError : null);
  const loadingLabel =
    state.loadingDate !== null
      ? `Loading ${fullDateLabel(state.loadingDate)}…`
      : null;
  const message = error ?? loadingLabel ?? state.statusMessage;
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
  const { dashboard, audience } = useDashboard();
  const { loadDashboardState, loadDashboardError } = dashboard.state;
  const failed = loadDashboardState === "error";
  const texts =
    audience === "public"
      ? {
          title: failed
            ? "Public dashboard unavailable"
            : "Loading public dashboard",
          body: failed
            ? (loadDashboardError ??
              "The public dashboard could not be loaded.")
            : "Loading the public dashboard…",
        }
      : {
          title: failed
            ? "Your dashboard is unavailable"
            : "Loading your saved log",
          body: failed
            ? (loadDashboardError ??
              "Your saved log is unavailable. Try again later.")
            : "Loading your saved log…",
        };
  return (
    <section className="dashboard-state" aria-live="polite">
      <span className="dashboard-state-mark" aria-hidden="true">
        {failed ? "!" : "…"}
      </span>
      <h1>{texts.title}</h1>
      <p>{texts.body}</p>
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

/** Tells a visitor that nothing on the page changes data. */
function PublicBanner() {
  const { dashboard } = useDashboard();
  const { timeZoneNotice } = dashboard.logic;
  return (
    <output className="data-banner public">
      <span aria-hidden="true">✓</span>
      <small>
        Public read-only view — changes are disabled.
        {timeZoneNotice !== null && (
          <>
            {" "}
            <span className="timezone-notice">{timeZoneNotice}</span>
          </>
        )}
      </small>
    </output>
  );
}

/** The parts that other features give the dashboard. Only the route composes them. */
export interface DashboardSlots {
  renderWeightTrend: (props: WeightSlotProps) => ReactNode;
  renderWeightPanel: (props: WeightSlotProps) => ReactNode;
  renderCalendar: (props: CalendarSlotProps) => ReactNode;
  renderInsights: (props: InsightsSlotProps) => ReactNode;
}

/** The parts that only the owner dashboard has. Only the route composes them. */
interface OwnerDashboardProps {
  audience: "owner";
  topbarActions: ReactNode;
  belowTopbar: ReactNode;
  settingsEvents: SettingsEvents;
  weightEvents: WeightEvents;
  weightBusy: boolean;
  /** The switch between the logs. It shows when the owner keeps a partner log. */
  renderProfileSwitch: (props: { partnerProfileEnabled: boolean }) => ReactNode;
}

type DashboardPageProps = DashboardSlots &
  ({ audience: "public" } | OwnerDashboardProps);

function DashboardView(props: DashboardPageProps) {
  const {
    renderWeightTrend,
    renderWeightPanel,
    renderCalendar,
    renderInsights,
  } = props;
  const { dashboard, form, actions, busy } = useDashboard();
  const { logic, state } = dashboard;
  const { hash } = useLocation();
  const weightSlot: WeightSlotProps = {
    dates: state.days.map((day) => day.date),
    weights: state.recentWeights,
    selectedDate: state.selectedDate,
    weight: state.weight,
    timeZone: state.timeZone,
    busy,
    trendDates: logic.visibleTrendDays.map((day) => day.date),
    trendWeights: state.trendWeights,
    trendRange: state.trendRange,
    onTrendRangeChange: (range) => logic.setTrendRange({ range }),
    audience: props.audience,
    openFormRequest: state.weightFormRequest,
  };
  useEffect(() => {
    logic.setActiveSection({ hash });
  }, [logic, hash]);
  const owner = props.audience === "owner" ? props : null;
  const settingsEvents = owner?.settingsEvents;
  const weightEvents = owner?.weightEvents;
  const formLogic = form.logic;
  // An insight sends the owner to the day of an entry, and its editor opens there.
  const onInspectEntry = useCallback(
    ({ entryId, date }: { entryId: string; date: string }) => {
      void logic.inspectEntry({ entryId, date }).then((entry) => {
        if (entry) {
          formLogic.startEdit({ entry });
        }
      });
    },
    [logic, formLogic],
  );
  const insightsSlot = useMemo<InsightsSlotProps>(
    () => ({
      entryEvents: [
        withoutWaiting(form.logic.events),
        withoutWaiting(actions.logic.events),
      ],
      settingsEvents: settingsEvents ? [settingsEvents] : [],
      weightEvents: weightEvents ? [weightEvents] : [],
      audience: props.audience,
      ...(props.audience === "owner" ? { onInspectEntry } : {}),
    }),
    [
      form.logic,
      actions.logic,
      settingsEvents,
      weightEvents,
      props.audience,
      onInspectEntry,
    ],
  );
  if (state.publicViewOff) {
    return <Navigate to="/owner" replace />;
  }

  return (
    <>
      {owner ? (
        <DashboardTopbar
          audience="owner"
          actions={owner.topbarActions}
          profileSwitch={owner.renderProfileSwitch({
            partnerProfileEnabled: state.partnerProfileEnabled,
          })}
        />
      ) : (
        <DashboardTopbar audience="public" />
      )}
      {owner?.belowTopbar}
      {state.loaded && !owner && <PublicBanner />}
      <Feedback />
      {state.loaded ? (
        <>
          <DateStrip />
          {state.showCalendar &&
            state.selectedDate !== null &&
            state.today !== null &&
            state.calendarMonth !== null &&
            renderCalendar({
              today: state.today,
              initialMonth: state.calendarMonth,
              selectedDate: state.selectedDate,
              reloadKey: state.reloadKey,
              disabled: busy,
              onSelectDate: (date) => void logic.selectCalendarDate({ date }),
              onClose: () => logic.closeCalendar(),
              audience: props.audience,
            })}
          <SectionTabs />
          <SummaryGrid />
          <div
            className={cx(
              "content-grid",
              state.showAllDays && "history-expanded",
            )}
          >
            <section className="primary-column">
              <CalorieTrendPanel />
              <ProteinTargetPanel />
              {renderWeightTrend(weightSlot)}
              <MacroTrendPanel />
              <NutrientConsistencyPanel />
              <NutritionOverview />
              {renderWeightPanel(weightSlot)}
              <MacroPanel />
              <RecentDaysPanel />
              {owner && <SavedEntriesPanel />}
              <MealsPanel />
            </section>
          </div>
          {renderInsights(insightsSlot)}
        </>
      ) : (
        <LoadingState />
      )}
      <PhotoPreview />
      <footer className="app-footer">
        <span>{owner ? "Private by default" : "Public read-only view"}</span>
        <span className="footer-separator" aria-hidden="true">
          ·
        </span>
        <span>Calocount dashboard</span>
      </footer>
    </>
  );
}

/**
 * The dashboard of the owner at `/owner`, and of a visitor at `/`. Other
 * features own the settings button and the dialog that it opens, so the route
 * gives them in. A visitor has none of them.
 */
export function DashboardPage(props: DashboardPageProps) {
  return props.audience === "owner" ? (
    <DashboardProvider
      audience="owner"
      settingsEvents={props.settingsEvents}
      weightEvents={props.weightEvents}
      weightBusy={props.weightBusy}
    >
      <DashboardView {...props} />
    </DashboardProvider>
  ) : (
    <DashboardProvider audience="public">
      <DashboardView {...props} />
    </DashboardProvider>
  );
}
