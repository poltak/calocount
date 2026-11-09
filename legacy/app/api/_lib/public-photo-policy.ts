import { resolveTimeZone, shiftDateKey, zonedCalendar } from "../../../domain/logical-date";

const publicPhotoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isPublicPhotoMimeType(value: string | null | undefined): value is string {
  return typeof value === "string" && publicPhotoMimeTypes.has(value);
}

/**
 * True when a meal falls on one of the seven calendar days that end on
 * `summaryDate`, counted in the owner's timezone. An unknown timezone is UTC.
 */
export function isWithinPublicDateRange({
  consumedAt,
  summaryDate,
  timeZone,
}: {
  consumedAt: number;
  summaryDate: string;
  timeZone?: string | null;
}): boolean {
  if (!Number.isFinite(consumedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(summaryDate)) return false;
  const calendar = zonedCalendar(resolveTimeZone(timeZone));
  const start = calendar.firstInstant(shiftDateKey(summaryDate, -6));
  const end = calendar.firstInstant(shiftDateKey(summaryDate, 1));
  return consumedAt >= start && consumedAt < end;
}
