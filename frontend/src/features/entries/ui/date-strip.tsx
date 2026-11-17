import { cx } from "../../core/utils/class-names.js";
import {
  dayOfMonth,
  formatKcal,
  fullDateLabel,
  weekdayInitial,
  weekdayOf,
} from "../../core/utils/dashboard-format.js";
import {
  calorieDayStatus,
  type CalorieDayStatus,
} from "../utils/dashboard-calculations.js";
import { useDashboard } from "./dashboard-context.js";

const STATUS_WORDS: Record<CalorieDayStatus, string> = {
  under: ", under goal",
  near: ", near goal",
  over: ", over goal",
  "in-progress": " so far",
};

/** The heading with the day in view, the streak, the arrows, and the seven recent days. */
export function DateStrip() {
  const { dashboard, busy } = useDashboard();
  const { logic, state } = dashboard;
  const selected = state.selectedDate ?? "";
  const { loggingStreak } = logic;
  return (
    <section className="date-strip" aria-label="Choose a day">
      <div className="date-heading">
        <p className="eyebrow">Your log</p>
        <h1 id="today">{`${weekdayOf(selected)}, ${fullDateLabel(selected)}`}</h1>
        {selected === state.today && <span className="today-chip">Today</span>}
        {loggingStreak >= 2 && (
          <span className="streak-chip">
            <span aria-hidden="true">✦ </span>
            {`${loggingStreak}-day logging streak`}
          </span>
        )}
      </div>
      <div className="date-controls">
        <button
          className="date-arrow"
          type="button"
          aria-label="Previous day"
          disabled={busy}
          onClick={() => void logic.goToPreviousDay()}
        >
          ‹
        </button>
        <div className="date-pills">
          {state.days.map((day) => {
            const logged = day.mealCount > 0;
            const calories = formatKcal(Math.round(day.calories));
            const status = calorieDayStatus({
              calories: day.calories,
              goal: state.targets.calories,
              isToday: day.date === state.today,
            });
            return (
              <button
                key={day.date}
                className={cx(
                  "date-pill",
                  selected === day.date && "active",
                  logged && "has-entries",
                )}
                type="button"
                disabled={busy}
                aria-label={`${weekdayOf(day.date)}, ${fullDateLabel(day.date)}${logged ? `, ${calories} calories${STATUS_WORDS[status]}` : ""}`}
                aria-pressed={selected === day.date}
                onClick={() => void logic.selectDate({ date: day.date })}
              >
                <span>{weekdayInitial(day.date)}</span>
                <strong>{dayOfMonth(day.date)}</strong>
                {logged && (
                  <small className={cx("date-pill-calories", status)}>
                    {calories}
                  </small>
                )}
              </button>
            );
          })}
        </div>
        <button
          className="date-arrow"
          type="button"
          aria-label="Next day"
          disabled={busy || selected >= (state.today ?? "")}
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
          aria-label={state.showCalendar ? "Close calendar" : "Open calendar"}
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
  );
}
