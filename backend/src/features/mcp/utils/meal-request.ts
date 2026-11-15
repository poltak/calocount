import {
  NUTRIENT_KEYS,
  NUTRIENT_UPPER_LIMIT_KEYS,
  NUTRIENT_META,
} from "@app/common/features/entries/utils/nutrients";
import type { ExternalMealRequest } from "../../entries/types.js";
import { photoRefOf } from "./photo-ref.js";
import { hasOnlyKeys, isObject, type JsonObject } from "./json-object.js";
import {
  MAX_BATCH_MEALS,
  MAX_KCAL,
  MAX_MACRO,
  MAX_NAME_LENGTH,
} from "./limits.js";
import { McpToolError } from "./mcp-tool-error.js";
import { NUTRIENT_UPPER_LIMIT_META } from "./tool-schema-parts.js";

const ISO_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const PHOTO_KEYS = ["download_url", "file_id", "mime_type", "file_name"];
const SUPPORTED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];

function invalidField(field: string, detail: string): never {
  throw new McpToolError("invalid_field", `${field} ${detail}.`);
}

function requiredString(body: JsonObject, field: string): string {
  if (!(field in body)) {
    throw new McpToolError("missing_field", `${field} is required.`);
  }
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    invalidField(field, "must be a non-empty string");
  }
  return value.trim();
}

function requiredNumber(body: JsonObject, field: string, max: number): number {
  if (!(field in body)) {
    throw new McpToolError("missing_field", `${field} is required.`);
  }
  const value = body[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalidField(field, "must be a finite non-negative number");
  }
  if (value > max) {
    invalidField(field, `must be at most ${max}`);
  }
  return value;
}

function parseNutrients(
  body: JsonObject,
): ExternalMealRequest["nutrients"] | undefined {
  if (!("nutrients" in body)) {
    return undefined;
  }
  const value = body["nutrients"];
  if (!isObject(value)) {
    invalidField("nutrients", "must be an object");
  }
  const allowed = new Set<string>([
    ...NUTRIENT_KEYS,
    ...NUTRIENT_UPPER_LIMIT_KEYS,
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      invalidField(`nutrients.${key}`, "is not a supported nutrient");
    }
  }
  const nutrients: NonNullable<ExternalMealRequest["nutrients"]> = {};
  for (const metadata of [...NUTRIENT_META, ...NUTRIENT_UPPER_LIMIT_META]) {
    if (!(metadata.key in value)) {
      continue;
    }
    const amount = value[metadata.key];
    if (amount === null) {
      nutrients[metadata.key] = null;
      continue;
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      invalidField(
        `nutrients.${metadata.key}`,
        "must be null or a finite non-negative number",
      );
    }
    if (amount > metadata.maximum) {
      invalidField(
        `nutrients.${metadata.key}`,
        `must be at most ${metadata.maximum}`,
      );
    }
    nutrients[metadata.key] = amount;
  }
  return nutrients;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** A date and time with seconds and an offset, as milliseconds. A text that `Date` would guess at is refused. */
export function parseIsoDatetime(value: string, field = "eaten_at"): number {
  const match = ISO_DATETIME.exec(value);
  if (!match) {
    invalidField(field, "must be a strict ISO-8601 datetime with a timezone");
  }
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number) as [number, number, number, number, number, number];
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);
  const daysInMonth =
    [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
      month - 1
    ] ?? 0;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    invalidField(field, "must be a valid ISO-8601 datetime");
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    invalidField(field, "must be a valid ISO-8601 datetime");
  }
  return timestamp;
}

export function parseRequestId(value: unknown): string {
  const requestId = requiredString({ request_id: value }, "request_id");
  if (!UUID.test(requestId)) {
    invalidField("request_id", "must be a valid UUID");
  }
  return requestId.toLowerCase();
}

function parseMeal({
  body,
  photo,
  allowLocalHttp,
}: {
  body: JsonObject;
  photo: PhotoValue | undefined;
  allowLocalHttp: boolean;
}): ExternalMealRequest {
  if (Object.hasOwn(body, "openaiFileIdRefs")) {
    throw new McpToolError(
      "invalid_field",
      "openaiFileIdRefs is not supported by MCP. Use top-level photos and photo_meal_indices so ChatGPT can supply file values.",
    );
  }
  const requestId = parseRequestId(body["request_id"]);
  const name = requiredString(body, "name");
  if (name.length > MAX_NAME_LENGTH) {
    invalidField("name", `must be at most ${MAX_NAME_LENGTH} characters`);
  }
  if (!("eaten_at" in body)) {
    throw new McpToolError("missing_field", "eaten_at is required.");
  }
  const eatenAt = body["eaten_at"];
  if (typeof eatenAt !== "string" || !eatenAt) {
    invalidField(
      "eaten_at",
      "must be a strict ISO-8601 datetime with a timezone",
    );
  }
  const nutrients = parseNutrients(body);
  return {
    requestId,
    name,
    kcal: requiredNumber(body, "kcal", MAX_KCAL),
    protein: requiredNumber(body, "protein", MAX_MACRO),
    carbs: requiredNumber(body, "carbs", MAX_MACRO),
    fat: requiredNumber(body, "fat", MAX_MACRO),
    consumedAt: parseIsoDatetime(eatenAt),
    ...(photo ? { photo: photoRefOf({ photo, allowLocalHttp }) } : {}),
    ...(nutrients === undefined ? {} : { nutrients }),
  };
}

/** A photo of the agent, checked, and the meal that gets it. */
interface PhotoValue {
  downloadUrl: string;
  mimeType: unknown;
}

/**
 * Check the photo values that the agent sends with the meals, and say which
 * meal gets which photo. An empty list is the same as no list.
 */
function checkPhotos(
  args: JsonObject,
  mealCount: number,
): Map<number, PhotoValue> {
  const byMeal = new Map<number, PhotoValue>();
  const hasPhotos = Object.hasOwn(args, "photos");
  const hasIndices = Object.hasOwn(args, "photo_meal_indices");
  if (!hasPhotos && !hasIndices) {
    return byMeal;
  }
  if (!hasPhotos || !hasIndices) {
    invalidField("photos and photo_meal_indices", "must be provided together");
  }
  const photos = args["photos"];
  const indices = args["photo_meal_indices"];
  if (!Array.isArray(photos) || !Array.isArray(indices)) {
    invalidField("photos and photo_meal_indices", "must be arrays");
  }
  if (photos.length > MAX_BATCH_MEALS || indices.length > MAX_BATCH_MEALS) {
    invalidField(
      "photos and photo_meal_indices",
      `must contain at most ${MAX_BATCH_MEALS} entries`,
    );
  }
  if (photos.length !== indices.length) {
    invalidField(
      "photos and photo_meal_indices",
      "must have the same number of entries",
    );
  }
  const seen = new Set<number>();
  for (const [photoIndex, photo] of photos.entries()) {
    const mealIndex: unknown = indices[photoIndex];
    if (
      typeof mealIndex !== "number" ||
      !Number.isInteger(mealIndex) ||
      mealIndex < 0 ||
      mealIndex >= mealCount
    ) {
      invalidField(
        `photo_meal_indices[${photoIndex}]`,
        "must point to a meal in meals",
      );
    }
    if (seen.has(mealIndex)) {
      invalidField("photo_meal_indices", "must contain unique meal indices");
    }
    seen.add(mealIndex);
    if (
      !isObject(photo) ||
      !hasOnlyKeys(photo, PHOTO_KEYS) ||
      typeof photo["download_url"] !== "string" ||
      !photo["download_url"].trim() ||
      typeof photo["file_id"] !== "string" ||
      !photo["file_id"].trim()
    ) {
      invalidField(
        `photos[${photoIndex}]`,
        "must be a file object with download_url and file_id. Bare local paths and bare file IDs cannot be resolved",
      );
    }
    const mimeType = photo["mime_type"];
    for (const field of ["mime_type", "file_name"]) {
      const value = photo[field];
      if (value !== undefined && (typeof value !== "string" || !value.trim())) {
        invalidField(
          `photos[${photoIndex}]`,
          "must be a file object with download_url and file_id. Bare local paths and bare file IDs cannot be resolved",
        );
      }
    }
    if (
      typeof mimeType === "string" &&
      !SUPPORTED_PHOTO_TYPES.includes(
        mimeType.split(";")[0]?.trim().toLowerCase() ?? "",
      )
    ) {
      throw new McpToolError(
        "unsupported_image_type",
        "This photo type is not supported. Use JPEG, PNG, WebP, or HEIC.",
      );
    }
    byMeal.set(mealIndex, {
      downloadUrl: photo["download_url"],
      mimeType,
    });
  }
  return byMeal;
}

/** The meals of an `add_meals` call. Nothing is saved when one field is wrong. */
export function parseAddMeals({
  args,
  allowLocalHttp,
}: {
  args: JsonObject;
  /** Only a black-box test Worker fetches a photo from a local server. */
  allowLocalHttp: boolean;
}): ExternalMealRequest[] {
  if (Object.hasOwn(args, "openaiFileIdRefs")) {
    throw new McpToolError(
      "invalid_field",
      "openaiFileIdRefs is not supported by MCP. Use meals with top-level photos and photo_meal_indices so ChatGPT can supply file values.",
    );
  }
  const meals = args["meals"];
  if (!Array.isArray(meals)) {
    throw new McpToolError(
      "invalid_field",
      "meals must be an array of meal objects.",
    );
  }
  if (meals.length < 1) {
    invalidField("meals", "must contain at least one meal");
  }
  if (meals.length > MAX_BATCH_MEALS) {
    invalidField("meals", `must contain at most ${MAX_BATCH_MEALS} meals`);
  }
  const photos = checkPhotos(args, meals.length);
  const requestIds = new Set<string>();
  return meals.map((meal: unknown, index) => {
    if (!isObject(meal)) {
      invalidField(`meals[${index}]`, "must be an object");
    }
    const request = parseMeal({
      body: meal,
      photo: photos.get(index),
      allowLocalHttp,
    });
    if (requestIds.has(request.requestId)) {
      invalidField(
        `meals[${index}].request_id`,
        "must be unique within the batch",
      );
    }
    requestIds.add(request.requestId);
    return request;
  });
}
