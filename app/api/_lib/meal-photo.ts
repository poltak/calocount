/**
 * Dashboard meal-photo upload helpers.
 *
 * Telegram uploads are validated in the ingest worker. Dashboard uploads use
 * the same three image formats, but are received as a multipart form and must
 * be bounded before they are written to R2.
 */

export const SUPPORTED_MEAL_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SupportedMealPhotoType = (typeof SUPPORTED_MEAL_PHOTO_TYPES)[number];

/** Keep dashboard uploads well below the Worker request limit. */
export const MAX_DASHBOARD_MEAL_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_DASHBOARD_MEAL_MULTIPART_BYTES = MAX_DASHBOARD_MEAL_PHOTO_BYTES + 1 * 1024 * 1024;

const MAX_PHOTO_SIGNATURE_BYTES = 12;
const PHOTO_FIELDS = ["photo", "image"] as const;
const PAYLOAD_FIELDS = ["payload", "meal", "data", "mealPayload"] as const;
const MEAL_FIELDS = [
  "id",
  "consumedAt",
  "source",
  "caption",
  "mealType",
  "status",
  "photoKey",
  "photoMimeType",
  "photoSizeBytes",
  "confidence",
  "assumptions",
  "notes",
  "items",
  "reason",
] as const;

export class MealPhotoError extends Error {
  constructor(
    public readonly status: 400 | 413 | 415,
    public readonly code: "invalid_multipart" | "invalid_photo" | "payload_too_large" | "unsupported_photo_type",
    message: string,
  ) {
    super(message);
    this.name = "MealPhotoError";
  }
}

export type MealPhotoUpload = {
  readonly bytes: ArrayBuffer;
  readonly contentType: SupportedMealPhotoType;
  readonly sizeBytes: number;
};

export type ParsedMultipartMeal = {
  readonly body: Record<string, unknown>;
  readonly photo: MealPhotoUpload | null;
};

export type MealPhotoBucket = {
  put(
    key: string,
    value: ArrayBuffer,
    options?: {
      readonly httpMetadata?: { readonly contentType?: string };
      readonly customMetadata?: Record<string, string>;
    },
  ): Promise<{ readonly size: number } | null>;
  delete(key: string): Promise<void>;
};

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.byteLength < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function detectImageContentType(bytes: Uint8Array): SupportedMealPhotoType | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWithBytes(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) return "image/webp";
  return null;
}

function normaliseContentType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

/** Validate downloaded or uploaded bytes against their declared image type. */
export function validateMealPhotoBytes(
  bytes: ArrayBuffer,
  declaredContentType: string,
): MealPhotoUpload {
  if (bytes.byteLength === 0) {
    throw new MealPhotoError(400, "invalid_photo", "The photo is empty.");
  }
  if (bytes.byteLength > MAX_DASHBOARD_MEAL_PHOTO_BYTES) {
    throw new MealPhotoError(413, "payload_too_large", "The photo is too large.");
  }

  const contentType = normaliseContentType(declaredContentType);
  if (!(SUPPORTED_MEAL_PHOTO_TYPES as readonly string[]).includes(contentType)) {
    throw new MealPhotoError(415, "unsupported_photo_type", "The photo must be a JPEG, PNG, or WebP image.");
  }
  const detectedType = detectImageContentType(new Uint8Array(bytes).subarray(0, MAX_PHOTO_SIGNATURE_BYTES));
  if (detectedType !== contentType) {
    throw new MealPhotoError(415, "unsupported_photo_type", "The photo content does not match its image type.");
  }
  return {
    bytes,
    contentType: contentType as SupportedMealPhotoType,
    sizeBytes: bytes.byteLength,
  };
}

function contentLength(request: Request): number | null {
  const value = request.headers.get("content-length");
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isMultipartFile(value: FormDataEntryValue | null): value is File {
  return value !== null && typeof value !== "string" && typeof value.arrayBuffer === "function";
}

function parsePayload(value: string, field: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new MealPhotoError(400, "invalid_multipart", `${field} must be valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MealPhotoError(400, "invalid_multipart", `${field} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseJsonField(value: string, field: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new MealPhotoError(400, "invalid_multipart", `${field} must be valid JSON.`);
  }
}

async function parsePhoto(value: FormDataEntryValue | null): Promise<MealPhotoUpload | null> {
  if (!isMultipartFile(value) || value.size === 0) return null;
  if (!Number.isSafeInteger(value.size) || value.size < 0) {
    throw new MealPhotoError(400, "invalid_photo", "The photo size is invalid.");
  }
  if (value.size > MAX_DASHBOARD_MEAL_PHOTO_BYTES) {
    throw new MealPhotoError(413, "payload_too_large", "The photo is too large.");
  }

  const declaredType = normaliseContentType(value.type);
  if (!(SUPPORTED_MEAL_PHOTO_TYPES as readonly string[]).includes(declaredType)) {
    throw new MealPhotoError(415, "unsupported_photo_type", "The photo must be a JPEG, PNG, or WebP image.");
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await value.arrayBuffer();
  } catch {
    throw new MealPhotoError(400, "invalid_photo", "The photo could not be read.");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_DASHBOARD_MEAL_PHOTO_BYTES) {
    throw new MealPhotoError(
      bytes.byteLength > MAX_DASHBOARD_MEAL_PHOTO_BYTES ? 413 : 400,
      bytes.byteLength > MAX_DASHBOARD_MEAL_PHOTO_BYTES ? "payload_too_large" : "invalid_photo",
      bytes.byteLength > MAX_DASHBOARD_MEAL_PHOTO_BYTES ? "The photo is too large." : "The photo is empty.",
    );
  }

  const detectedType = detectImageContentType(new Uint8Array(bytes).subarray(0, MAX_PHOTO_SIGNATURE_BYTES));
  if (detectedType !== declaredType) {
    throw new MealPhotoError(415, "unsupported_photo_type", "The photo content does not match its image type.");
  }

  return {
    bytes,
    contentType: declaredType as SupportedMealPhotoType,
    sizeBytes: bytes.byteLength,
  };
}

/** Return true when a request should use the dashboard multipart path. */
export function isMultipartMealRequest(request: Request): boolean {
  return normaliseContentType(request.headers.get("content-type") ?? "") === "multipart/form-data";
}

/**
 * Parse the multipart dashboard form. A JSON `payload`/`meal`/`data` field is
 * preferred so existing meal payloads can be sent without changing shape.
 * Direct scalar fields are also accepted for small clients and tests.
 */
export async function parseMultipartMealRequest(request: Request): Promise<ParsedMultipartMeal> {
  const declaredLength = contentLength(request);
  if (declaredLength !== null && declaredLength > MAX_DASHBOARD_MEAL_MULTIPART_BYTES) {
    throw new MealPhotoError(413, "payload_too_large", "The request is too large.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new MealPhotoError(400, "invalid_multipart", "The multipart form is invalid.");
  }

  let body: Record<string, unknown> = {};
  for (const field of PAYLOAD_FIELDS) {
    const value = form.get(field);
    if (value === null) continue;
    if (typeof value !== "string") {
      throw new MealPhotoError(400, "invalid_multipart", `${field} must be JSON text.`);
    }
    body = parsePayload(value, field);
    break;
  }

  for (const field of MEAL_FIELDS) {
    const value = form.get(field);
    if (value === null || typeof value !== "string") continue;
    if (field === "items" || field === "assumptions") body[field] = parseJsonField(value, field);
    else if (body[field] === undefined) body[field] = value;
  }

  let photoValue: FormDataEntryValue | null = null;
  for (const field of PHOTO_FIELDS) {
    const value = form.get(field);
    if (value !== null) {
      photoValue = value;
      break;
    }
  }

  // Multipart callers cannot point a meal at an arbitrary private R2 key.
  // They either upload a new file or leave the current photo untouched.
  delete body.photoKey;
  delete body.photoMimeType;
  delete body.photoSizeBytes;

  return {
    body,
    photo: await parsePhoto(photoValue),
  };
}

function keySegment(value: string, fallback: string): string {
  const segment = value
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return segment || fallback;
}

function randomKeyPart(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function dashboardMealPhotoKey(ownerKey: string, mealId?: string): string {
  return `meals/${keySegment(ownerKey, "owner")}/dashboard/${keySegment(mealId ?? "new", "new")}/${randomKeyPart()}`;
}

export async function uploadDashboardMealPhoto({
  bucket,
  ownerKey,
  mealId,
  photo,
}: {
  readonly bucket: MealPhotoBucket;
  readonly ownerKey: string;
  readonly mealId?: string;
  readonly photo: MealPhotoUpload;
}): Promise<{ readonly key: string; readonly mimeType: SupportedMealPhotoType; readonly sizeBytes: number }> {
  const key = dashboardMealPhotoKey(ownerKey, mealId);
  const stored = await bucket.put(key, photo.bytes, {
    httpMetadata: { contentType: photo.contentType },
  });
  return {
    key,
    mimeType: photo.contentType,
    sizeBytes: stored?.size ?? photo.sizeBytes,
  };
}

/** Best-effort cleanup for an object that is no longer linked by a meal row. */
export async function deleteUploadedMealPhoto(bucket: MealPhotoBucket, key: string): Promise<boolean> {
  try {
    await bucket.delete(key);
    return true;
  } catch {
    return false;
  }
}

export type StoredDashboardMealPhoto = Awaited<ReturnType<typeof uploadDashboardMealPhoto>>;

/** Upload a new photo, then remove it again if saving the meal fails. */
export async function createMealWithDashboardPhoto<T>({
  bucket,
  ownerKey,
  mealId,
  photo,
  save,
}: {
  readonly bucket: MealPhotoBucket;
  readonly ownerKey: string;
  readonly mealId?: string;
  readonly photo: MealPhotoUpload;
  readonly save: (uploaded: StoredDashboardMealPhoto) => Promise<T>;
}): Promise<{ readonly value: T; readonly photo: StoredDashboardMealPhoto }> {
  const uploaded = await uploadDashboardMealPhoto({ bucket, ownerKey, mealId, photo });
  try {
    const value = await save(uploaded);
    return { value, photo: uploaded };
  } catch (error) {
    await deleteUploadedMealPhoto(bucket, uploaded.key);
    throw error;
  }
}

/**
 * Upload a replacement before saving the meal. The old object is deleted only
 * after the save succeeds; a failed save removes the new object instead.
 */
export async function replaceMealPhoto<T>({
  bucket,
  ownerKey,
  mealId,
  previousPhotoKey,
  photo,
  save,
  shouldDeletePrevious,
}: {
  readonly bucket: MealPhotoBucket;
  readonly ownerKey: string;
  readonly mealId: string;
  readonly previousPhotoKey: string | null;
  readonly photo: MealPhotoUpload;
  readonly save: (uploaded: StoredDashboardMealPhoto) => Promise<T>;
  readonly shouldDeletePrevious?: () => Promise<boolean>;
}): Promise<{ readonly value: T; readonly photo: StoredDashboardMealPhoto; readonly previousPhotoDeleted?: boolean }> {
  const uploaded = await uploadDashboardMealPhoto({ bucket, ownerKey, mealId, photo });
  try {
    const value = await save(uploaded);
    if (!previousPhotoKey || previousPhotoKey === uploaded.key) return { value, photo: uploaded };
    if (shouldDeletePrevious && !(await shouldDeletePrevious())) return { value, photo: uploaded };
    return {
      value,
      photo: uploaded,
      previousPhotoDeleted: await deleteUploadedMealPhoto(bucket, previousPhotoKey),
    };
  } catch (error) {
    await deleteUploadedMealPhoto(bucket, uploaded.key);
    throw error;
  }
}
