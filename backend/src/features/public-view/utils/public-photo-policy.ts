import {
  resolveTimeZone,
  shiftDateKey,
  zonedCalendar,
} from "@app/common/features/core/utils/logical-date";

const PUBLIC_PHOTO_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Only a still image is public. Another type, such as SVG, can carry script. */
export function isPublicPhotoMimeType(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && PUBLIC_PHOTO_MIME_TYPES.has(value);
}

/**
 * True when an entry falls on one of the seven days that end on
 * `summaryDate`, counted in the given timezone. An unknown timezone is UTC.
 */
export function isWithinPublicPhotoWindow({
  consumedAt,
  summaryDate,
  timeZone,
}: {
  consumedAt: number;
  summaryDate: string;
  timeZone: string | null | undefined;
}): boolean {
  const calendar = zonedCalendar(resolveTimeZone(timeZone));
  return (
    consumedAt >= calendar.firstInstant(shiftDateKey(summaryDate, -6)) &&
    consumedAt < calendar.firstInstant(shiftDateKey(summaryDate, 1))
  );
}
