/**
 * Calendar days in a named timezone.
 *
 * A "logical date" is the YYYY-MM-DD date a moment falls on for someone in
 * that timezone. The dashboard and the daily totals group entries by it.
 */

const DAY_MS = 86_400_000;

interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function dateTimeFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    calendar: "iso8601",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    second: "2-digit",
    timeZone,
    year: "numeric",
  });
}

function datePartValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  return Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
}

function zonedDateParts(
  formatter: Intl.DateTimeFormat,
  timestamp: number,
): ZonedDateParts {
  const parts = formatter.formatToParts(new Date(timestamp));
  return {
    year: datePartValue(parts, "year"),
    month: datePartValue(parts, "month"),
    day: datePartValue(parts, "day"),
    hour: datePartValue(parts, "hour"),
    minute: datePartValue(parts, "minute"),
    second: datePartValue(parts, "second"),
  };
}

function utcTimestamp({
  year,
  month,
  day,
}: Pick<ZonedDateParts, "year" | "month" | "day">): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function dateKeyFromParts(
  parts: Pick<ZonedDateParts, "year" | "month" | "day">,
): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** Shift a YYYY-MM-DD date by whole days. */
export function shiftDateKey(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const shifted = new Date(utcTimestamp({ year, month, day }) + days * DAY_MS);
  return dateKeyFromParts({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) {
    return false;
  }
  try {
    dateTimeFormatter(value).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** The requested timezone when it is valid, otherwise UTC. */
export function resolveTimeZone(requested: string | null | undefined): string {
  return isValidTimeZone(requested) ? requested : "UTC";
}

interface ZonedCalendar {
  readonly timeZone: string;
  /** The logical date a moment falls on. */
  dateKey(timestamp: number): string;
  /** The hour of the day, 0 to 23, at a moment. */
  hour(timestamp: number): number;
  /** The first moment of a logical date. Handles days that are not 24 hours long. */
  firstInstant(date: string): number;
  /** Milliseconds to add to a UTC timestamp to read the local wall time at that moment. */
  utcOffsetMs(timestamp: number): number;
}

/** Date arithmetic for one timezone. Reuses one formatter for every conversion. */
export function zonedCalendar(timeZone: string): ZonedCalendar {
  const formatter = dateTimeFormatter(timeZone);
  const dateKey = (timestamp: number) =>
    dateKeyFromParts(zonedDateParts(formatter, timestamp));
  return {
    timeZone,
    dateKey,
    hour: (timestamp) => zonedDateParts(formatter, timestamp).hour,
    utcOffsetMs(timestamp) {
      const parts = zonedDateParts(formatter, timestamp);
      const wallTime = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      );
      return wallTime - Math.floor(timestamp / 1000) * 1000;
    },
    firstInstant(date) {
      const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
      const target = utcTimestamp({ year, month, day });
      let low = target - 3 * DAY_MS;
      let high = target + 3 * DAY_MS;

      while (dateKey(low) >= date) {
        low -= DAY_MS;
      }
      while (dateKey(high) < date) {
        high += DAY_MS;
      }
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (dateKey(middle) < date) {
          low = middle;
        } else {
          high = middle;
        }
      }
      return high;
    },
  };
}

/**
 * The moment at which the wall clock of a timezone shows a date and an HH:MM
 * time. It is `null` for a time that does not exist, such as one that a change
 * to summer time skips.
 */
export function zonedTimestamp({
  date,
  time,
  timeZone,
}: {
  date: string;
  time: string;
  timeZone: string;
}): number | null {
  if (!isDateKey(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return null;
  }
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hours, minutes);
  const calendar = zonedCalendar(timeZone);
  // The offset at the guess can differ from the offset at the result, when a
  // change of offset lies between them. A second pass settles that.
  const first = wallTime - calendar.utcOffsetMs(wallTime);
  const timestamp = wallTime - calendar.utcOffsetMs(first);
  return timestamp + calendar.utcOffsetMs(timestamp) === wallTime
    ? timestamp
    : null;
}
