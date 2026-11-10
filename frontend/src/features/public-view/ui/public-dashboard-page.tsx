import { useMemo, type ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { cx } from "../../core/utils/class-names.js";
import {
  dayOfMonth,
  formatNumber,
  fullDateLabel,
  weekdayInitial,
  weekdayOf,
} from "../../core/utils/dashboard-format.js";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { PublicDashboardLogic } from "./public-dashboard-logic.js";
import type { CalendarSlotProps } from "../../entries/types.js";
import { PublicEntryRow } from "./public-entry-row.js";
import { PublicPhotoPreview } from "./public-photo-preview.js";

function Topbar() {
  return (
    <header className="topbar">
      <Link className="brand" to="/" aria-label="Calocount public view">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>calocount</span>
      </Link>
      <div className="topbar-actions">
        <span className="sync-status">
          <span className="status-dot" aria-hidden="true" /> Public read-only
        </span>
        <Link className="secondary-button owner-link" to="/owner">
          Open owner view
        </Link>
        <span className="avatar" aria-label="Public read-only view">
          <span aria-hidden="true">↗</span>
        </span>
      </div>
    </header>
  );
}

/**
 * The log that the owner shares, at `/`. A visitor has no session, so the page
 * reads only the public JSON, and it has no control that changes data.
 */
export function PublicDashboardPage({
  renderCalendar,
}: {
  /** The calendar of the history feature, which `routes.tsx` gives the page. */
  renderCalendar: (props: CalendarSlotProps) => ReactNode;
}) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({ storage: {}, services: {}, api: { public: app.api.public } }),
    [app],
  );
  const { logic, state } = useLogic({
    LogicClass: PublicDashboardLogic,
    deps,
  });
  if (state.off) {
    return <Navigate to="/owner" replace />;
  }
  const { previewEntry } = state;
  const selected = state.selectedDate ?? "";
  const calories = state.entries.reduce(
    (sum, entry) => sum + entry.calories,
    0,
  );
  const protein = state.entries.reduce((sum, entry) => sum + entry.protein, 0);
  const weekday = selected === "" ? "" : weekdayOf(selected);
  return (
    <>
      <Topbar />
      {state.loadState === "error" && (
        <section className="dashboard-state" aria-live="polite">
          <span className="dashboard-state-mark" aria-hidden="true">
            !
          </span>
          <h1>The public dashboard is unavailable</h1>
          <p>{state.loadError}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => void logic.load()}
          >
            Try again
          </button>
        </section>
      )}
      {state.loadState !== "success" && state.loadState !== "error" && (
        <section className="dashboard-state" aria-live="polite">
          <span className="dashboard-state-mark" aria-hidden="true">
            …
          </span>
          <h1>Loading public dashboard</h1>
          <p>Loading the public dashboard…</p>
        </section>
      )}
      {state.loadState === "success" && state.selectedDate && (
        <>
          <section className="date-strip" aria-label="Choose a day">
            <div className="date-heading">
              <p className="eyebrow">Shared log</p>
              <h1 id="today">{`${weekday}, ${fullDateLabel(selected)}`}</h1>
              {selected === state.today && (
                <span className="today-chip">Today</span>
              )}
              <p className="timezone-notice">
                {`Days and times are shown in ${state.timeZone} time.`}
              </p>
            </div>
            <div className="date-controls">
              <button
                className="date-arrow"
                type="button"
                aria-label="Previous day"
                onClick={() => void logic.goToPreviousDay()}
              >
                ‹
              </button>
              <div className="date-pills">
                {state.days.map((day) => (
                  <button
                    key={day.date}
                    className={cx(
                      "date-pill",
                      selected === day.date && "active",
                      day.mealCount > 0 && "has-entries",
                    )}
                    type="button"
                    aria-label={`${weekdayOf(day.date)}, ${fullDateLabel(day.date)}`}
                    aria-pressed={selected === day.date}
                    onClick={() => void logic.selectDate({ date: day.date })}
                  >
                    <span>{weekdayInitial(day.date)}</span>
                    <strong>{dayOfMonth(day.date)}</strong>
                  </button>
                ))}
              </div>
              <button
                className="date-arrow"
                type="button"
                aria-label="Next day"
                disabled={selected >= (state.today ?? "")}
                onClick={() => void logic.goToNextDay()}
              >
                ›
              </button>
              <button
                className={cx(
                  "date-arrow calendar-toggle",
                  state.showCalendar && "active",
                )}
                type="button"
                aria-label={
                  state.showCalendar ? "Close calendar" : "Open calendar"
                }
                aria-expanded={state.showCalendar}
                aria-controls="history-calendar"
                onClick={() => logic.toggleCalendar()}
              >
                <svg
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="3.5" width="12" height="10.5" rx="2" />
                  <path d="M2 7h12M5.5 2v3M10.5 2v3" />
                </svg>
              </button>
            </div>
          </section>
          {state.showCalendar &&
            state.today !== null &&
            state.calendarMonth !== null &&
            renderCalendar({
              today: state.today,
              initialMonth: state.calendarMonth,
              selectedDate: selected,
              // The public data does not change under the visitor.
              reloadKey: 0,
              disabled: state.loadDayState === "running",
              onSelectDate: (date) => void logic.selectCalendarDate({ date }),
              onClose: () => logic.closeCalendar(),
              source: "public",
            })}
          <section
            className="summary-grid"
            aria-label="Daily calorie and protein summary"
          >
            <article className="summary-card calories-card">
              <div className="summary-copy">
                <p className="card-label">Calories</p>
                <p className="metric-value">
                  {`${formatNumber(Math.round(calories))} `}
                  <span>{`/ ${formatNumber(Math.round(state.calorieTarget))}`}</span>
                </p>
              </div>
            </article>
            <article className="summary-card protein-card">
              <div className="summary-copy">
                <p className="card-label">Protein</p>
                <p className="metric-value">
                  {`${formatNumber(Math.round(protein))}g `}
                  {state.proteinTargetG !== null && (
                    <span>{`/ ${formatNumber(Math.round(state.proteinTargetG))}g`}</span>
                  )}
                </p>
                {state.weightKg !== null && (
                  <p className="metric-subtitle">{`Weight ${state.weightKg} kg`}</p>
                )}
              </div>
            </article>
          </section>
          <div className="content-grid">
            <section className="primary-column">
              <section
                className="panel meals-panel"
                id="meals"
                aria-labelledby="meals-title"
              >
                <div className="panel-heading meal-heading">
                  <div>
                    <p className="eyebrow">What was consumed</p>
                    <h2 id="meals-title">
                      Entries <span>{state.entries.length}</span>
                    </h2>
                  </div>
                </div>
                {state.loadDayError && (
                  <p className="action-feedback error" role="alert">
                    {state.loadDayError}
                  </p>
                )}
                {state.entries.length > 0 ? (
                  <div className="meal-list">
                    {state.entries.map((entry) => (
                      <PublicEntryRow
                        key={entry.id}
                        entry={entry}
                        photoUrl={logic.shownPhotoUrl({ entry })}
                        onOpenPhoto={() => logic.openPhoto({ entry })}
                        onPhotoFailed={() => logic.markPhotoFailed({ entry })}
                      />
                    ))}
                  </div>
                ) : (
                  state.loadDayState === "success" && (
                    <div className="empty-meals">
                      <strong>{`No entries logged for ${weekday}`}</strong>
                    </div>
                  )
                )}
              </section>
            </section>
          </div>
        </>
      )}
      {previewEntry && (
        <PublicPhotoPreview
          entry={previewEntry}
          url={logic.shownPhotoUrl({ entry: previewEntry })}
          onClose={() => logic.closePhoto()}
          onFailed={() => logic.markPhotoFailed({ entry: previewEntry })}
        />
      )}
      <footer className="app-footer">
        <span>Public read-only view</span>
        <span className="footer-separator" aria-hidden="true">
          ·
        </span>
        <span>Calocount dashboard</span>
      </footer>
    </>
  );
}
