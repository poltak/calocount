const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const longDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const clock = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

/** A date such as "Nov 9". */
export function formatShortDate(date: string): string {
  return shortDate.format(new Date(`${date}T00:00:00.000Z`));
}

/** A date such as "Nov 9, 2026". */
export function formatLongDate(date: string): string {
  return longDate.format(new Date(`${date}T00:00:00Z`));
}

export function formatClock(timestamp: number): string {
  return clock.format(new Date(timestamp));
}

export function formatDateRange(startDate: string, endDate: string): string {
  return `${formatShortDate(startDate)}–${formatShortDate(endDate)}`;
}

/** A number with at most `digits` decimals. */
export function formatDecimal(value: number, digits = 1): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function plural(count: number): string {
  return count === 1 ? "" : "s";
}
