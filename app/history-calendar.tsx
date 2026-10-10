"use client";

import { useEffect, useState } from "react";
import { shiftMonthKey } from "../domain/logical-date";
import { parseCalendarMonth, type CalendarMonth } from "./dashboard-api";
import { calendarWeeks } from "./history-calendar-grid";

type HistoryCalendarProps = {
  /** Today in the timezone of the dashboard. */
  today: string;
  selectedDate: string;
  timeZone: string;
  /** Changes when saved entries can be different, so the months load again. */
  refreshKey: number;
  disabled: boolean;
  onSelectDate: (date: string) => void;
  onClose: () => void;
};

type LoadedMonth = CalendarMonth & { refreshKey: number };

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function monthLabel(month: string) {
  return monthFormatter.format(new Date(`${month}-01T12:00:00.000Z`));
}

/** A month of days with the calories and protein of each one. A day opens when the owner chooses it. */
export function HistoryCalendar({ today, selectedDate, timeZone, refreshKey, disabled, onSelectDate, onClose }: HistoryCalendarProps) {
  const [month, setMonth] = useState(() => selectedDate.slice(0, 7));
  const [loadedMonths, setLoadedMonths] = useState<Record<string, LoadedMonth>>({});
  const [failedMonth, setFailedMonth] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const loaded = loadedMonths[month];
  const current = loaded?.refreshKey === refreshKey;
  const failed = failedMonth === month;

  useEffect(() => {
    if (current) return;
    const controller = new AbortController();
    async function loadMonth() {
      try {
        const response = await fetch(`/api/days?month=${month}&timezone=${encodeURIComponent(timeZone)}`, { cache: "no-store", signal: controller.signal });
        const parsed = response.ok ? parseCalendarMonth(await response.json()) : null;
        if (controller.signal.aborted) return;
        if (!parsed || parsed.month !== month) {
          setFailedMonth(month);
          return;
        }
        setLoadedMonths((months) => ({ ...months, [month]: { ...parsed, refreshKey } }));
        setFailedMonth((failure) => failure === month ? null : failure);
      } catch {
        if (!controller.signal.aborted) setFailedMonth(month);
      }
    }
    void loadMonth();
    return () => controller.abort();
  }, [current, month, refreshKey, retryCount, timeZone]);

  const totalsByDate = new Map((loaded?.days ?? []).map((day) => [day.date, day]));
  // The log starts at the first entry. A day before it can still be the selected one.
  const knownFirstDates = Object.values(loadedMonths).flatMap((entry) => entry.firstDate ? [entry.firstDate] : []);
  const firstMonth = [today, selectedDate, ...knownFirstDates].sort()[0].slice(0, 7);
  const currentMonth = today.slice(0, 7);
  const label = monthLabel(month);

  return <section className="panel history-calendar" id="history-calendar" aria-label="Calendar of past days">
    <div className="history-calendar-heading">
      <button className="date-arrow" type="button" onClick={() => setMonth(shiftMonthKey(month, -1))} disabled={month <= firstMonth} aria-label="Previous month">‹</button>
      <h2 aria-live="polite">{label}</h2>
      <button className="date-arrow" type="button" onClick={() => setMonth(shiftMonthKey(month, 1))} disabled={month >= currentMonth} aria-label="Next month">›</button>
      <span className="history-calendar-legend" aria-hidden="true"><span><i className="calendar-key calories" /> kcal</span><span><i className="calendar-key protein" /> protein</span></span>
      <button className="close-button" type="button" onClick={onClose} aria-label="Close calendar">×</button>
    </div>
    <div className="history-calendar-weekdays" aria-hidden="true">{weekdayLabels.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
    <div className="history-calendar-grid" aria-busy={!current && !failed}>
      {calendarWeeks(month).flat().map((cell, index) => {
        if (!cell) return <span className="calendar-day is-outside" key={`outside-${index}`} />;
        const totals = totalsByDate.get(cell.date);
        const dayLabel = dayFormatter.format(new Date(`${cell.date}T12:00:00.000Z`));
        return <button
          className={`calendar-day${totals ? " has-entries" : ""}${cell.date === today ? " is-today" : ""}${cell.date === selectedDate ? " is-selected" : ""}`}
          key={cell.date}
          type="button"
          disabled={disabled || cell.date > today}
          aria-pressed={cell.date === selectedDate}
          aria-label={totals
            ? `${dayLabel}: ${numberFormatter.format(totals.calories)} kilocalories, ${numberFormatter.format(totals.proteinG)} grams of protein`
            : `${dayLabel}: no entries`}
          onClick={() => onSelectDate(cell.date)}
        >
          <span className="calendar-day-number">{cell.dayOfMonth}</span>
          {totals ? <>
            <span className="calendar-day-calories">{numberFormatter.format(totals.calories)}</span>
            <span className="calendar-day-protein">{numberFormatter.format(totals.proteinG)}g</span>
          </> : null}
        </button>;
      })}
    </div>
    {failed ? <p className="history-calendar-status" role="alert">
      {label} could not be loaded.
      <button className="secondary-button" type="button" onClick={() => { setFailedMonth(null); setRetryCount((count) => count + 1); }}>Try again</button>
    </p> : !loaded ? <p className="history-calendar-status" role="status">Loading {label}…</p> : null}
  </section>;
}
