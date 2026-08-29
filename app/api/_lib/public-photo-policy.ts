const publicPhotoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isPublicPhotoMimeType(value: string | null | undefined): value is string {
  return typeof value === "string" && publicPhotoMimeTypes.has(value);
}

export function isWithinPublicDateRange({
  consumedAt,
  summaryDate,
}: {
  consumedAt: number;
  summaryDate: string;
}): boolean {
  const end = Date.parse(`${summaryDate}T00:00:00.000Z`) + 86_400_000;
  if (!Number.isFinite(end) || !Number.isFinite(consumedAt)) return false;
  const start = end - 7 * 86_400_000;
  return consumedAt >= start && consumedAt < end;
}
