import { cx } from "../../core/utils/class-names.js";
import {
  dayOfMonth,
  formatNumber,
  weekdayOf,
} from "../../core/utils/dashboard-format.js";
import {
  calculateLoggingStreak,
  calculateTargetPercent,
} from "../utils/dashboard-calculations.js";
import { useDashboard } from "./dashboard-context.js";

/** The recent days with their calories, and the number of days in a row with an entry. */
export function RecentDaysPanel() {
  const { dashboard, busy } = useDashboard();
  const { logic, state } = dashboard;
  const { days, selectedDate, showAllDays, targets } = state;
  // A day older than the seven recent days is not in `days`, so no streak shows for it.
  const showsStreak = days.some((day) => day.date === selectedDate);
  const streak =
    selectedDate === null
      ? 0
      : calculateLoggingStreak({ days, endDate: selectedDate });
  return (
    <section
      className="panel history-panel compact-dashboard-panel"
      aria-labelledby="history-title"
    >
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Keep the thread</p>
          <h2 id="history-title">Recent days</h2>
        </div>
        <button
          className="more-button"
          type="button"
          onClick={() => logic.toggleAllDays()}
        >
          {showAllDays ? "Less" : "View all"}
        </button>
      </div>
      <div className="history-list">
        {days
          .slice(showAllDays ? 0 : 3)
          .toReversed()
          .map((day) => (
            <button
              key={day.date}
              className={cx(
                "history-row",
                selectedDate === day.date && "selected",
              )}
              type="button"
              disabled={busy}
              onClick={() => void logic.selectDate({ date: day.date })}
            >
              <span className="history-date">
                <strong>{dayOfMonth(day.date)}</strong>
                <small>{weekdayOf(day.date).slice(0, 3)}</small>
              </span>
              <span className="history-bar">
                <i
                  style={{
                    width: `${calculateTargetPercent(day.calories, targets.calories)}%`,
                  }}
                />
              </span>
              <span className="history-calories">
                {formatNumber(day.calories)}
                <small> kcal</small>
              </span>
              <span className="history-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
      </div>
      {showsStreak && (
        <div className="streak-line">
          <span className="streak-flame" aria-hidden="true">
            ✦
          </span>
          <span>
            <strong>{`${streak} day${streak === 1 ? "" : "s"}`}</strong>
            {" logging streak"}
          </span>
        </div>
      )}
    </section>
  );
}
