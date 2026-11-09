/** Small helpers shared by the insight calculations. */

/** Shift a YYYY-MM-DD date by whole days in UTC. An unparseable date is returned unchanged. */
export function shiftIsoDate(date: string, offsetDays: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + offsetDays);
  return parsed.toISOString().slice(0, 10);
}

export function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** The grouping key for a food name. Every insight panel must group foods the same way. */
export function normalizeFoodName(name: string): string {
  return name.trim().toLowerCase();
}
