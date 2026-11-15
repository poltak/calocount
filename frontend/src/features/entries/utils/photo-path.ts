/**
 * The path of a photo under `/api/photos`: each segment of the key is
 * encoded, and the slashes between them stay. `null` for a key with an empty
 * segment, which names no object.
 */
export function photoPath(key: string | null | undefined): string | null {
  if (!key) {
    return null;
  }
  const segments = key.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    return null;
  }
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}
