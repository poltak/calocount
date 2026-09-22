import type { ExternalMealResult, MealWithItems } from "../../../db/repository";
import {
  NUTRIENT_KEYS,
  NUTRIENT_META,
  NUTRIENT_UPPER_LIMIT_KEYS,
  NUTRIENT_UPPER_LIMIT_META,
  type PartialTrackedNutrientValues,
} from "../../../domain/nutrients";
import {
  MAX_DASHBOARD_MEAL_PHOTO_BYTES,
  MealPhotoError,
  SUPPORTED_MEAL_PHOTO_TYPES,
  validateMealPhotoBytes,
  type MealPhotoUpload,
  type SupportedMealPhotoType,
} from "./meal-photo";

const MAX_NAME_LENGTH = 200;
const MAX_KCAL = 100_000;
const MAX_MACRO = 10_000;
const MAX_OPENAI_FILE_REFS = 20;
const MAX_BATCH_MEALS = 20;
const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const OPENAI_FILE_BASE_DOMAIN = "oaiusercontent.com";
const OPENAI_FILE_HOSTS = new Set([
  "files.oaiusercontent.com",
  "files.openai.com",
]);
const ENDPOINT_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "pragma": "no-cache",
  "x-robots-tag": "noindex, nofollow, noarchive",
};

export class AddMealRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AddMealRequestError";
  }
}

export type OpenAIFileRef = {
  declaredContentType: SupportedMealPhotoType;
  downloadLink: string;
};

export type AddMealRequest = {
  requestId: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  eatenAt: string;
  consumedAt: number;
  imageRef?: OpenAIFileRef;
  nutrients?: PartialTrackedNutrientValues;
};

export type DailyMealTotals = {
  date: string;
  calories: number;
  proteinG: number;
  mealCount: number;
};

export type StoredAddMealPhoto = {
  readonly key: string;
  readonly mimeType: SupportedMealPhotoType;
  readonly sizeBytes: number;
};

export type AddMealHandlerOptions = {
  expectedToken: string | undefined;
  ownerKey: string | undefined;
  /** Tests may provide an already parsed body. Routes should use readBody. */
  body?: Record<string, unknown>;
  readBody?: () => Promise<Record<string, unknown>>;
  /** This pre-check avoids a second download on a normal sequential retry. */
  findExistingMeal?: (ownerKey: string, requestId: string) => Promise<MealWithItems | null>;
  getDailyTotals?: (ownerKey: string, now: number) => Promise<DailyMealTotals>;
  fetchImage?: typeof fetch;
  uploadPhoto?: (
    ownerKey: string,
    requestId: string,
    photo: MealPhotoUpload,
  ) => Promise<StoredAddMealPhoto>;
  deletePhoto?: (photo: StoredAddMealPhoto) => Promise<void>;
  createMeal: (
    ownerKey: string,
    request: AddMealRequest,
    photo: StoredAddMealPhoto | null,
  ) => Promise<ExternalMealResult>;
  createMeals?: (
    ownerKey: string,
    requests: Array<{ request: AddMealRequest; photo: StoredAddMealPhoto | null }>,
  ) => Promise<ExternalMealResult[]>;
};

function invalidField(field: string, detail: string): never {
  throw new AddMealRequestError(400, "invalid_field", `${field} ${detail}.`);
}

function requiredString(body: Record<string, unknown>, field: string): string {
  if (!(field in body)) {
    throw new AddMealRequestError(400, "missing_field", `${field} is required.`);
  }
  if (typeof body[field] !== "string" || !body[field].trim()) {
    invalidField(field, "must be a non-empty string");
  }
  return body[field].trim();
}

function requiredNumber(body: Record<string, unknown>, field: string, max: number): number {
  if (!(field in body)) {
    throw new AddMealRequestError(400, "missing_field", `${field} is required.`);
  }
  const value = body[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalidField(field, "must be a finite non-negative number");
  }
  if (value > max) invalidField(field, `must be at most ${max}`);
  return value;
}

function parseNullableNutrients(body: Record<string, unknown>): PartialTrackedNutrientValues | undefined {
  if (!("nutrients" in body)) return undefined;
  const value = body.nutrients;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidField("nutrients", "must be an object");
  }

  const record = value as Record<string, unknown>;
  const allowed = new Set<string>([...NUTRIENT_KEYS, ...NUTRIENT_UPPER_LIMIT_KEYS]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) invalidField(`nutrients.${key}`, "is not a supported nutrient");
  }

  const nutrients: PartialTrackedNutrientValues = {};
  const metadataEntries = [...NUTRIENT_META, ...NUTRIENT_UPPER_LIMIT_META];
  for (const metadata of metadataEntries) {
    if (!(metadata.key in record)) continue;
    const nutrient = record[metadata.key];
    if (nutrient === null) {
      nutrients[metadata.key] = null;
      continue;
    }
    if (typeof nutrient !== "number" || !Number.isFinite(nutrient) || nutrient < 0) {
      invalidField(`nutrients.${metadata.key}`, "must be null or a finite non-negative number");
    }
    if (nutrient > metadata.maximum) {
      invalidField(`nutrients.${metadata.key}`, `must be at most ${metadata.maximum}`);
    }
    nutrients[metadata.key] = nutrient;
  }
  return nutrients;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function parseIsoDatetime(value: string): number {
  const match = ISO_DATETIME.exec(value);
  if (!match) invalidField("eaten_at", "must be a strict ISO-8601 datetime with a timezone");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1] ?? 0;
  if (
    month < 1 || month > 12 || day < 1 || day > daysInMonth
    || hour > 23 || minute > 59 || second > 59
    || offsetHour > 23 || offsetMinute > 59
  ) {
    invalidField("eaten_at", "must be a valid ISO-8601 datetime");
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) invalidField("eaten_at", "must be a valid ISO-8601 datetime");
  return timestamp;
}

function normaliseContentType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function supportedContentType(value: unknown): SupportedMealPhotoType | null {
  if (typeof value !== "string") return null;
  const normalised = normaliseContentType(value);
  return (SUPPORTED_MEAL_PHOTO_TYPES as readonly string[]).includes(normalised)
    ? normalised as SupportedMealPhotoType
    : null;
}

function isAllowedOpenAIFileHost(hostname: string): boolean {
  return OPENAI_FILE_HOSTS.has(hostname)
    || hostname.endsWith(`.${OPENAI_FILE_BASE_DOMAIN}`);
}

function safeOpenAIFileUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || !parsed.pathname
    || parsed.pathname === "/"
    || !isAllowedOpenAIFileHost(parsed.hostname.toLowerCase())
  ) return null;
  return parsed.toString();
}

function parseImageRef(body: Record<string, unknown>): OpenAIFileRef | undefined {
  if (!("openaiFileIdRefs" in body)) return undefined;
  const refs = body.openaiFileIdRefs;
  if (!Array.isArray(refs)) {
    invalidField("openaiFileIdRefs", "must be an array");
  }
  if (refs.length > MAX_OPENAI_FILE_REFS) {
    invalidField("openaiFileIdRefs", `must contain at most ${MAX_OPENAI_FILE_REFS} entries`);
  }
  if (refs.length === 0) return undefined;

  for (const ref of refs) {
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) continue;
    const record = ref as Record<string, unknown>;
    const contentType = supportedContentType(record.mime_type);
    const downloadLink = safeOpenAIFileUrl(record.download_link);
    if (contentType && downloadLink) return { declaredContentType: contentType, downloadLink };
  }

  throw new AddMealRequestError(400, "invalid_image_refs", "openaiFileIdRefs contains no usable image.");
}

export function parseAddMealRequest(body: Record<string, unknown>, now = Date.now()): AddMealRequest {
  const requestIdValue = requiredString(body, "request_id");
  if (!UUID.test(requestIdValue)) invalidField("request_id", "must be a valid UUID");
  const requestId = requestIdValue.toLowerCase();
  const name = requiredString(body, "name");
  if (name.length > MAX_NAME_LENGTH) invalidField("name", `must be at most ${MAX_NAME_LENGTH} characters`);
  if (!("eaten_at" in body)) {
    throw new AddMealRequestError(400, "missing_field", "eaten_at is required.");
  }
  if (typeof body.eaten_at !== "string" || !body.eaten_at) {
    invalidField("eaten_at", "must be a strict ISO-8601 datetime with a timezone");
  }
  const eatenAt = body.eaten_at;
  const consumedAt = parseIsoDatetime(eatenAt);
  if (!Number.isFinite(now)) throw new AddMealRequestError(500, "invalid_clock", "The server clock is invalid.");
  const nutrients = parseNullableNutrients(body);

  return {
    requestId,
    name,
    kcal: requiredNumber(body, "kcal", MAX_KCAL),
    protein: requiredNumber(body, "protein", MAX_MACRO),
    carbs: requiredNumber(body, "carbs", MAX_MACRO),
    fat: requiredNumber(body, "fat", MAX_MACRO),
    eatenAt,
    consumedAt,
    imageRef: parseImageRef(body),
    ...(nutrients === undefined ? {} : { nutrients }),
  };
}

export function parseAddMealRequests(
  body: Record<string, unknown>,
  now = Date.now(),
): { batch: boolean; requests: AddMealRequest[] } {
  if (!("meals" in body)) {
    return { batch: false, requests: [parseAddMealRequest(body, now)] };
  }

  const value = body.meals;
  if (!Array.isArray(value)) invalidField("meals", "must be an array");
  if (value.length < 1) invalidField("meals", "must contain at least one meal");
  if (value.length > MAX_BATCH_MEALS) invalidField("meals", `must contain at most ${MAX_BATCH_MEALS} meals`);

  const requestIds = new Set<string>();
  const requests = value.map((meal, index) => {
    if (!meal || typeof meal !== "object" || Array.isArray(meal)) {
      invalidField(`meals[${index}]`, "must be an object");
    }
    const request = parseAddMealRequest(meal as Record<string, unknown>, now);
    if (requestIds.has(request.requestId)) {
      invalidField(`meals[${index}].request_id`, "must be unique within the batch");
    }
    requestIds.add(request.requestId);
    return request;
  });
  return { batch: true, requests };
}

async function tokensMatch(expectedToken: string, actualToken: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [expectedHash, actualHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expectedToken)),
    crypto.subtle.digest("SHA-256", encoder.encode(actualToken)),
  ]);
  const expected = new Uint8Array(expectedHash);
  const actual = new Uint8Array(actualHash);
  let difference = expected.length ^ actual.length;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ actual[index];
  }
  return difference === 0;
}

async function authenticate(request: Request, expectedToken: string | undefined): Promise<void> {
  const configuredToken = expectedToken?.trim();
  if (!configuredToken) {
    throw new AddMealRequestError(503, "chatgpt_meal_token_missing", "The ChatGPT meal token is not configured.");
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(\S+)$/iu.exec(authorization);
  if (!match || !(await tokensMatch(configuredToken, match[1]))) {
    throw new AddMealRequestError(401, "unauthorized", "A valid Bearer token is required.");
  }
}

function dailyTotalsPayload(totals: DailyMealTotals) {
  return {
    date: totals.date,
    kcal: totals.calories,
    protein: totals.proteinG,
    meal_count: totals.mealCount,
  };
}

function mealResponsePayload(
  status: "created" | "already_exists",
  entry: MealWithItems,
  requestId: string,
  photoStatus?: "download_failed",
): Record<string, unknown> {
  const meal = entry.meal;
  return {
    status,
    meal_id: meal.id,
    request_id: meal.externalRequestId ?? requestId,
    name: meal.caption,
    kcal: meal.totalCalories,
    protein: meal.totalProteinG,
    carbs: meal.totalCarbsG,
    fat: meal.totalFatG,
    eaten_at: new Date(meal.consumedAt).toISOString(),
    has_image: Boolean(meal.photoKey),
    ...(photoStatus ? { photo_status: photoStatus } : {}),
  };
}

function responseForMeal(
  status: "created" | "already_exists",
  entry: MealWithItems,
  requestId: string,
  photoStatus?: "download_failed",
  dailyTotals?: DailyMealTotals,
): Response {
  return Response.json({
    ...mealResponsePayload(status, entry, requestId, photoStatus),
    ...(dailyTotals ? { daily_totals: dailyTotalsPayload(dailyTotals) } : {}),
  }, {
    status: status === "created" ? 201 : 200,
    headers: ENDPOINT_HEADERS,
  });
}

async function getDailyTotals(
  options: AddMealHandlerOptions,
  ownerKey: string,
  now: number,
): Promise<DailyMealTotals | undefined> {
  return options.getDailyTotals?.(ownerKey, now);
}

function contentLength(response: Response): number | null {
  const value = response.headers.get("content-length");
  if (value === null) return null;
  const trimmed = value.trim();
  if (!/^\d+$/u.test(trimmed)) {
    throw new AddMealRequestError(502, "image_download_failed", "The image response size is invalid.");
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    throw new AddMealRequestError(413, "payload_too_large", "The image is too large.");
  }
  return parsed;
}

async function downloadOpenAIPhoto(ref: OpenAIFileRef, fetchImage: typeof fetch): Promise<MealPhotoUpload> {
  let response: Response;
  try {
    response = await fetchImage(ref.downloadLink, { redirect: "error" });
  } catch {
    throw new AddMealRequestError(502, "image_download_failed", "The image could not be downloaded.");
  }
  if (!response.ok) {
    throw new AddMealRequestError(502, "image_download_failed", "The image could not be downloaded.");
  }

  const responseType = supportedContentType(response.headers.get("content-type"));
  if (!responseType || responseType !== ref.declaredContentType) {
    throw new AddMealRequestError(400, "invalid_image", "The downloaded image type is invalid.");
  }

  const declaredLength = contentLength(response);
  if (declaredLength !== null && declaredLength > MAX_DASHBOARD_MEAL_PHOTO_BYTES) {
    throw new AddMealRequestError(413, "payload_too_large", "The image is too large.");
  }
  if (!response.body) {
    throw new AddMealRequestError(502, "image_download_failed", "The image response has no body.");
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = response.body.getReader();
  } catch {
    throw new AddMealRequestError(502, "image_download_failed", "The image response could not be read.");
  }
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) {
        throw new AddMealRequestError(502, "image_download_failed", "The image response is invalid.");
      }
      byteCount += chunk.value.byteLength;
      if (byteCount > MAX_DASHBOARD_MEAL_PHOTO_BYTES) {
        await reader.cancel("payload_too_large").catch(() => undefined);
        throw new AddMealRequestError(413, "payload_too_large", "The image is too large.");
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    if (error instanceof AddMealRequestError) throw error;
    throw new AddMealRequestError(502, "image_download_failed", "The image could not be read.");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (declaredLength !== null && declaredLength !== byteCount) {
    throw new AddMealRequestError(502, "image_download_failed", "The image response size is invalid.");
  }
  try {
    return validateMealPhotoBytes(bytes.buffer, ref.declaredContentType);
  } catch (error) {
    if (error instanceof MealPhotoError) {
      const status = error.status === 413 ? 413 : 400;
      throw new AddMealRequestError(status, error.code, error.message);
    }
    throw error;
  }
}

async function cleanupPhoto(
  photo: StoredAddMealPhoto | null,
  deletePhoto: AddMealHandlerOptions["deletePhoto"],
): Promise<void> {
  if (!photo || !deletePhoto) return;
  try {
    await deletePhoto(photo);
  } catch {
    // The meal row is the source of truth. Cleanup is best effort after a
    // conflict or a failed database write.
  }
}

export async function handleAddMealRequest(
  request: Request,
  options: AddMealHandlerOptions,
  now = Date.now(),
): Promise<Response> {
  await authenticate(request, options.expectedToken);
  const ownerKey = options.ownerKey?.trim();
  if (!ownerKey) throw new AddMealRequestError(503, "owner_key_missing", "The meal owner is not configured.");

  const body = options.body ?? (options.readBody ? await options.readBody() : undefined);
  if (!body) throw new AddMealRequestError(400, "invalid_json", "The request body must be valid JSON.");
  const parsed = parseAddMealRequests(body, now);
  const inputs = parsed.requests;
  const existing = new Map<string, MealWithItems>();
  if (options.findExistingMeal) {
    const found = await Promise.all(inputs.map(async (input) => ({
      requestId: input.requestId,
      meal: await options.findExistingMeal?.(ownerKey, input.requestId),
    })));
    for (const item of found) {
      if (item.meal) existing.set(item.requestId, item.meal);
    }
  }

  if (!parsed.batch) {
    const input = inputs[0];
    if (!input) throw new AddMealRequestError(400, "invalid_field", "A meal is required.");
    const alreadyStored = existing.get(input.requestId);
    if (alreadyStored) {
      return responseForMeal(
        "already_exists",
        alreadyStored,
        input.requestId,
        undefined,
        await getDailyTotals(options, ownerKey, now),
      );
    }

    let uploaded: StoredAddMealPhoto | null = null;
    let photoDownloadFailed = false;
    try {
      if (input.imageRef) {
        if (!options.fetchImage || !options.uploadPhoto) {
          throw new AddMealRequestError(503, "photos_unavailable", "Photo storage is not configured.");
        }
        let photo: MealPhotoUpload | null = null;
        try {
          photo = await downloadOpenAIPhoto(input.imageRef, options.fetchImage);
        } catch (error) {
          if (!(error instanceof AddMealRequestError) || error.code !== "image_download_failed") throw error;
          photoDownloadFailed = true;
        }
        if (photo) uploaded = await options.uploadPhoto(ownerKey, input.requestId, photo);
      }

      const result = await options.createMeal(ownerKey, input, uploaded);
      if (!result.created) {
        await cleanupPhoto(uploaded, options.deletePhoto);
        uploaded = null;
      } else {
        uploaded = null;
      }
      const responsePhotoStatus = photoDownloadFailed && !result.meal.meal.photoKey
        ? "download_failed"
        : undefined;
      return responseForMeal(
        result.created ? "created" : "already_exists",
        result.meal,
        input.requestId,
        responsePhotoStatus,
        await getDailyTotals(options, ownerKey, now),
      );
    } catch (error) {
      await cleanupPhoto(uploaded, options.deletePhoto);
      throw error;
    }
  }

  const pending = inputs.filter((input) => !existing.has(input.requestId));
  if (pending.length > 0 && !options.createMeals) {
    throw new AddMealRequestError(503, "batch_unavailable", "Batch meal creation is not configured.");
  }

  const uploaded = new Map<string, StoredAddMealPhoto>();
  const photoDownloadFailed = new Set<string>();
  try {
    for (const input of pending) {
      if (!input.imageRef) continue;
      if (!options.fetchImage || !options.uploadPhoto) {
        throw new AddMealRequestError(503, "photos_unavailable", "Photo storage is not configured.");
      }
      let photo: MealPhotoUpload | null = null;
      try {
        photo = await downloadOpenAIPhoto(input.imageRef, options.fetchImage);
      } catch (error) {
        if (!(error instanceof AddMealRequestError) || error.code !== "image_download_failed") throw error;
        photoDownloadFailed.add(input.requestId);
      }
      if (photo) uploaded.set(input.requestId, await options.uploadPhoto(ownerKey, input.requestId, photo));
    }

    const createdResults = pending.length > 0
      ? await options.createMeals?.(ownerKey, pending.map((input) => ({
        request: input,
        photo: uploaded.get(input.requestId) ?? null,
      })))
      : [];
    if (createdResults === undefined || createdResults.length !== pending.length) {
      throw new Error("external_meal_batch_create_failed");
    }

    const results = new Map<string, ExternalMealResult>();
    for (const [requestId, meal] of existing) results.set(requestId, { created: false, meal });
    for (const [index, result] of createdResults.entries()) {
      const input = pending[index];
      if (!input || !result) throw new Error("external_meal_batch_create_failed");
      results.set(input.requestId, result);
      const storedPhoto = uploaded.get(input.requestId);
      if (!result.created) {
        await cleanupPhoto(storedPhoto ?? null, options.deletePhoto);
      }
      uploaded.delete(input.requestId);
    }

    const dailyTotals = await getDailyTotals(options, ownerKey, now);
    const meals = inputs.map((input) => {
      const result = results.get(input.requestId);
      if (!result) throw new Error("external_meal_batch_create_failed");
      const responsePhotoStatus = photoDownloadFailed.has(input.requestId) && !result.meal.meal.photoKey
        ? "download_failed"
        : undefined;
      return mealResponsePayload(
        result.created ? "created" : "already_exists",
        result.meal,
        input.requestId,
        responsePhotoStatus,
      );
    });
    const createdCount = createdResults.filter((result) => result.created).length;
    return Response.json({
      status: "batch_processed",
      created_count: createdCount,
      already_exists_count: inputs.length - createdCount,
      meals,
      ...(dailyTotals ? { daily_totals: dailyTotalsPayload(dailyTotals) } : {}),
    }, {
      status: createdCount > 0 ? 201 : 200,
      headers: ENDPOINT_HEADERS,
    });
  } catch (error) {
    for (const photo of uploaded.values()) await cleanupPhoto(photo, options.deletePhoto);
    throw error;
  }
}
