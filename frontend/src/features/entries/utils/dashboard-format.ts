const numberFormatter = new Intl.NumberFormat("en-US");
const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  timeZone: "UTC",
});
const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const trendDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** A date key at noon UTC, so that no timezone moves it to another day. */
function noon(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

export function weekdayOf(date: string): string {
  return weekdayFormatter.format(noon(date));
}

/** A day such as "August 20, 2026". */
export function fullDateLabel(date: string): string {
  return fullDateFormatter.format(noon(date));
}

/** A day such as "Aug 20", as the charts name it. */
export function trendDateLabel(date: string): string {
  return trendDateFormatter.format(noon(date));
}

/** The day of the month as a number. */
export function dayOfMonth(date: string): string {
  return String(noon(date).getUTCDate());
}

/** The first letter of the weekday, for the date strip. */
export function weekdayInitial(date: string): string {
  return weekdayOf(date).slice(0, 1);
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

/** A 24-hour HH:MM time in a timezone, as the entries and the add form show it. */
export function clockTime(timestamp: number, timeZone: string): string {
  let formatter = clockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    clockFormatters.set(timeZone, formatter);
  }
  return formatter.format(new Date(timestamp));
}
