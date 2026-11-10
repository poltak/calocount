import { useEffect, useMemo } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { cx } from "../../core/utils/class-names.js";
import {
  fullDateLabel,
  monthLabel,
  weekdayOf,
} from "../../core/utils/dashboard-format.js";
import { CalendarLogic } from "./calendar-logic.js";

interface CalendarPanelProps {
  /** Today, in the timezone of the device. */
  today: string;
  /** The month to show first. It stays the same while the calendar is open. */
  initialMonth: string;
  selectedDate: string;
  /** Changes when entries can be different, so the month is read again. */
  reloadKey: number;
  disabled: boolean;
  onSelectDate: (date: string) => void;
  onClose: () => void;
  /** Whose days to read. The default is the owner's. */
  source?: "owner" | "public";
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/** A month of past days with the calories and protein of each one. The panel opens on the month of the day in view. */
export function CalendarPanel({
  today,
  initialMonth,
  selectedDate,
  reloadKey,
  disabled,
  onSelectDate,
  onClose,
  source = "owner",
}: CalendarPanelProps) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: {},
      services: { clock: app.services.clock },
      api: { days: app.api.days, public: app.api.public },
      initialMonth,
      source,
    }),
    [app, initialMonth, source],
  );
  const { logic, state } = useLogic({ LogicClass: CalendarLogic, deps });
  useEffect(() => {
    void logic.refresh({ reloadKey });
  }, [logic, reloadKey]);

  const { month, weeks, months, loadMonthState } = state;
  const loaded = months[month];
  const failed = loadMonthState === "error";
  const current = loaded?.reloadKey === reloadKey;
  const totalsByDate = new Map(
    (loaded?.days ?? []).map((day) => [day.date, day]),
  );
  const { firstMonth, lastMonth } = logic.monthBounds({ today, selectedDate });
  const label = monthLabel(month);
  return (
    <section
      className="panel history-calendar"
      id="history-calendar"
      aria-label="Calendar of past days"
    >
      <div className="history-calendar-heading">
        <button
          className="date-arrow"
          type="button"
          aria-label="Previous month"
          disabled={month <= firstMonth}
          onClick={() => void logic.showPreviousMonth()}
        >
          ‹
        </button>
        <h2 aria-live="polite">{label}</h2>
        <button
          className="date-arrow"
          type="button"
          aria-label="Next month"
          disabled={month >= lastMonth}
          onClick={() => void logic.showNextMonth()}
        >
          ›
        </button>
        <span className="history-calendar-legend" aria-hidden="true">
          <span>
            <i className="calendar-key calories" /> kcal
          </span>
          <span>
            <i className="calendar-key protein" /> protein
          </span>
        </span>
        <button
          className="close-button"
          type="button"
          aria-label="Close calendar"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="history-calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="history-calendar-grid" aria-busy={!current && !failed}>
        {weeks.flat().map((cell, index) => {
          if (!cell) {
            // The empty slots of a week have no identity but their place.
            // oxlint-disable-next-line react/no-array-index-key
            return <span key={index} className="calendar-day is-outside" />;
          }
          const totals = totalsByDate.get(cell.date);
          const dayLabel = `${weekdayOf(cell.date)}, ${fullDateLabel(cell.date)}`;
          return (
            <button
              key={cell.date}
              className={cx(
                "calendar-day",
                totals && "has-entries",
                cell.date === today && "is-today",
                cell.date === selectedDate && "is-selected",
              )}
              type="button"
              disabled={disabled || cell.date > today}
              aria-pressed={cell.date === selectedDate}
              aria-label={
                totals
                  ? `${dayLabel}: ${numberFormatter.format(totals.calories)} kilocalories, ${numberFormatter.format(totals.proteinG)} grams of protein`
                  : `${dayLabel}: no entries`
              }
              onClick={() => onSelectDate(cell.date)}
            >
              <span className="calendar-day-number">{cell.dayOfMonth}</span>
              {totals && (
                <>
                  <span className="calendar-day-calories">
                    {numberFormatter.format(totals.calories)}
                  </span>
                  <span className="calendar-day-protein">
                    {`${numberFormatter.format(totals.proteinG)}g`}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {failed ? (
        <p className="history-calendar-status" role="alert">
          {`${label} could not be loaded.`}
          <button
            className="secondary-button"
            type="button"
            onClick={() => void logic.loadMonth()}
          >
            Try again
          </button>
        </p>
      ) : (
        !loaded && (
          <output className="history-calendar-status">
            {`Loading ${label}…`}
          </output>
        )
      )}
    </section>
  );
}
