import { zonedCalendar, type ZonedCalendar } from "../domain/logical-date";

const calendars = new Map<string, ZonedCalendar>();

/** The calendar date a moment falls on in a timezone. */
export function dateKeyInTimeZone(timestamp: number, timeZone: string) {
  let calendar = calendars.get(timeZone);
  if (!calendar) {
    calendar = zonedCalendar(timeZone);
    calendars.set(timeZone, calendar);
  }
  return calendar.dateKey(timestamp);
}

export function localTimeValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function mealDateTimestamp({ date, time }: { date: string; time: string }): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;

  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const parsed = new Date(0);
  parsed.setFullYear(year, month - 1, day);
  parsed.setHours(hours, minutes, 0, 0);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
    || parsed.getHours() !== hours
    || parsed.getMinutes() !== minutes
  ) return null;
  return parsed.getTime();
}
