export function photoUrlForKey(photoKey: string | null | undefined): string | null {
  if (!photoKey) return null;

  const segments = photoKey.split("/");
  if (segments.some((segment) => segment.length === 0)) return null;
  return `/api/photos/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

/** Build the public image URL from a meal ID, without exposing its R2 key. */
export function publicPhotoUrlForMealId(mealId: string | null | undefined): string | null {
  const id = mealId?.trim();
  if (!id || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) return null;
  return `/meal-photos/${encodeURIComponent(id)}`;
}
