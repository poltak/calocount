export function photoUrlForKey(photoKey: string | null | undefined): string | null {
  if (!photoKey) return null;

  const segments = photoKey.split("/");
  if (segments.some((segment) => segment.length === 0)) return null;
  return `/api/photos/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}
