import { component, cx, h, type Component } from "./dom";
import { shiftMonthKey } from "../../domain/logical-date";
import { parseCalendarMonth, type CalendarMonth } from "../dashboard-api";
import { calendarWeeks } from "../history-calendar-grid";

type HistoryCalendarProps = {
  /** Today in the timezone of the dashboard. */
  today: string;
  selectedDate: string;
  /** The owner view counts days in this timezone. The public view uses the owner's saved timezone. */
  timeZone: string;
  publicView: boolean;
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

/** A month of days with the calories and protein of each one. A day opens when the viewer chooses it. */
export function createHistoryCalendar({ selectedDate }: { selectedDate: string }): Component<HistoryCalendarProps> & { destroy: () => void } {
  let month = selectedDate.slice(0, 7);
  let loadedMonths: Record<string, LoadedMonth> = {};
  let failedMonth: string | null = null;
  let retryCount = 0;
  let request: { key: string; controller: AbortController } | null = null;

  /** Load the month in view when its totals are missing or older than the last save. */
  function loadWhenStale({ timeZone, publicView, refreshKey }: HistoryCalendarProps) {
    const current = loadedMonths[month]?.refreshKey === refreshKey;
    const key = [current, month, publicView, refreshKey, retryCount, timeZone].join("|");
    if (request?.key === key) return;
    request?.controller.abort();
    request = null;
    if (current) return;
    const controller = new AbortController();
    const requestedMonth = month;
    request = { key, controller };
    void (async () => {
      try {
        const endpoint = publicView
          ? `/api/public/summary?view=month&month=${requestedMonth}`
          : `/api/days?month=${requestedMonth}&timezone=${encodeURIComponent(timeZone)}`;
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const parsed = response.ok ? parseCalendarMonth(await response.json()) : null;
        if (controller.signal.aborted) return;
        if (!parsed || parsed.month !== requestedMonth) {
          failedMonth = requestedMonth;
        } else {
          loadedMonths = { ...loadedMonths, [requestedMonth]: { ...parsed, refreshKey } };
          if (failedMonth === requestedMonth) failedMonth = null;
        }
      } catch {
        if (controller.signal.aborted) return;
        failedMonth = requestedMonth;
      }
      calendar.rerender();
    })();
  }

  function showMonth(next: string) {
    month = next;
    calendar.rerender();
  }

  const calendar = component<HistoryCalendarProps>(
    h("section", { class: "panel history-calendar", id: "history-calendar", "aria-label": "Calendar of past days" }),
    (props) => {
      const { today, selectedDate: selected, refreshKey, disabled, onSelectDate, onClose } = props;
      loadWhenStale(props);
      const loaded = loadedMonths[month];
      const current = loaded?.refreshKey === refreshKey;
      const failed = failedMonth === month;
      const totalsByDate = new Map((loaded?.days ?? []).map((day) => [day.date, day]));
      // The log starts at the first entry. A day before it can still be the selected one.
      const knownFirstDates = Object.values(loadedMonths).flatMap((entry) => entry.firstDate ? [entry.firstDate] : []);
      const firstMonth = [today, selected, ...knownFirstDates].sort()[0].slice(0, 7);
      const currentMonth = today.slice(0, 7);
      const label = monthLabel(month);

      return [
        h("div", { class: "history-calendar-heading" },
          h("button", { class: "date-arrow", type: "button", onclick: () => showMonth(shiftMonthKey(month, -1)), disabled: month <= firstMonth, "aria-label": "Previous month" }, "‹"),
          h("h2", { "aria-live": "polite" }, label),
          h("button", { class: "date-arrow", type: "button", onclick: () => showMonth(shiftMonthKey(month, 1)), disabled: month >= currentMonth, "aria-label": "Next month" }, "›"),
          h("span", { class: "history-calendar-legend", "aria-hidden": "true" },
            h("span", null, h("i", { class: "calendar-key calories" }), " kcal"),
            h("span", null, h("i", { class: "calendar-key protein" }), " protein"),
          ),
          h("button", { class: "close-button", type: "button", onclick: onClose, "aria-label": "Close calendar" }, "×"),
        ),
        h("div", { class: "history-calendar-weekdays", "aria-hidden": "true" }, weekdayLabels.map((weekday) => h("span", null, weekday))),
        h("div", { class: "history-calendar-grid", "aria-busy": !current && !failed },
          calendarWeeks(month).flat().map((cell) => {
            if (!cell) return h("span", { class: "calendar-day is-outside" });
            const totals = totalsByDate.get(cell.date);
            const dayLabel = dayFormatter.format(new Date(`${cell.date}T12:00:00.000Z`));
            return h("button", {
              class: cx("calendar-day", totals && "has-entries", cell.date === today && "is-today", cell.date === selected && "is-selected"),
              type: "button",
              disabled: disabled || cell.date > today,
              "aria-pressed": cell.date === selected,
              "aria-label": totals
                ? `${dayLabel}: ${numberFormatter.format(totals.calories)} kilocalories, ${numberFormatter.format(totals.proteinG)} grams of protein`
                : `${dayLabel}: no entries`,
              onclick: () => onSelectDate(cell.date),
            },
              h("span", { class: "calendar-day-number" }, cell.dayOfMonth),
              totals ? [
                h("span", { class: "calendar-day-calories" }, numberFormatter.format(totals.calories)),
                h("span", { class: "calendar-day-protein" }, `${numberFormatter.format(totals.proteinG)}g`),
              ] : null,
            );
          }),
        ),
        failed ? h("p", { class: "history-calendar-status", role: "alert" },
          `${label} could not be loaded.`,
          h("button", { class: "secondary-button", type: "button", onclick: () => { failedMonth = null; retryCount += 1; calendar.rerender(); } }, "Try again"),
        ) : !loaded ? h("p", { class: "history-calendar-status", role: "status" }, `Loading ${label}…`) : null,
      ];
    },
  );

  return {
    ...calendar,
    destroy() {
      request?.controller.abort();
      request = null;
    },
  };
}
