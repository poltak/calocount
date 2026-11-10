import { cx } from "../../core/utils/class-names.js";
import {
  dayOfMonth,
  fullDateLabel,
  weekdayInitial,
  weekdayOf,
} from "../../core/utils/dashboard-format.js";
import { useDashboard } from "./dashboard-context.js";

/** The heading with the day in view, the arrows, and the seven recent days. */
export function DateStrip() {
  const { dashboard, busy } = useDashboard();
  const { logic, state } = dashboard;
  const selected = state.selectedDate ?? "";
  return (
    <section className="date-strip" aria-label="Choose a day">
      <div className="date-heading">
        <p className="eyebrow">Your log</p>
        <h1 id="today">{`${weekdayOf(selected)}, ${fullDateLabel(selected)}`}</h1>
        {selected === state.today && <span className="today-chip">Today</span>}
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
          {state.days.map((day) => (
            <button
              key={day.date}
              className={cx(
                "date-pill",
                selected === day.date && "active",
                day.mealCount > 0 && "has-entries",
              )}
              type="button"
              disabled={busy}
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
          disabled={busy || selected >= (state.today ?? "")}
          onClick={() => void logic.goToNextDay()}
        >
          ›
        </button>
      </div>
    </section>
  );
}
