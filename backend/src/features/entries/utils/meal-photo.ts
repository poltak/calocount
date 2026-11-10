import {
  MAX_MEAL_PHOTO_BYTES,
  MEAL_PHOTO_TYPES,
} from "@app/common/features/entries/utils/meal-photo";
import { AppError } from "../../core/errors/app-error.js";

/** A photo that passed the checks of type and size, and is ready for the bucket. */
export interface PhotoUpload {
  bytes: ArrayBuffer;
  contentType: string;
  sizeBytes: number;
}

/** The photo, its fields, and a margin for the rest of the form. */
export const MAX_MULTIPART_BYTES = MAX_MEAL_PHOTO_BYTES + 1024 * 1024;
const MAX_JSON_BYTES = 100 * 1024;

/** The prefix of every photo key. The cleanup lists only this prefix. */
export const PHOTO_PREFIX = "meals/";

const PHOTO_FIELDS = ["photo", "image"];
const PAYLOAD_FIELDS = ["payload", "meal", "data", "mealPayload"];
const ENTRY_FIELDS = [
  "id",
  "consumedAt",
  "source",
  "caption",
  "mealType",
  "status",
  "confidence",
  "assumptions",
  "notes",
  "items",
  "reason",
];
/** Fields whose form value is JSON text. */
const JSON_FIELDS = ["items", "assumptions"];

const TYPE_MESSAGE = "The photo must be a JPEG, PNG, or WebP image.";

function invalid(message: string) {
  return new AppError({ code: "INVALID_REQUEST", message });
}

function tooLarge(message: string) {
  return new AppError({ code: "PAYLOAD_TOO_LARGE", message });
}

function wrongType(message: string) {
  return new AppError({ code: "UNSUPPORTED_MEDIA_TYPE", message });
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function detectType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

function mediaType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

/** Check the bytes of a photo against the type that the caller declared. The file name has no part in it. */
function checkPhoto({
  bytes,
  declaredType,
}: {
  bytes: ArrayBuffer;
  declaredType: string;
}): PhotoUpload {
  if (bytes.byteLength === 0) {
    throw invalid("The photo is empty.");
  }
  if (bytes.byteLength > MAX_MEAL_PHOTO_BYTES) {
    throw tooLarge("The photo is too large.");
  }
  const contentType = mediaType(declaredType);
  if (!MEAL_PHOTO_TYPES.includes(contentType)) {
    throw wrongType(TYPE_MESSAGE);
  }
  if (
    detectType(new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength))) !==
    contentType
  ) {
    throw wrongType("The photo content does not match its image type.");
  }
  return { bytes, contentType, sizeBytes: bytes.byteLength };
}

/**
 * Read a stream into memory, and stop when it holds more than `maxBytes`.
 * `null` means too large, and the stream is cancelled. A claimed
 * `Content-Length` proves nothing, so the count is of the bytes read.
 */
export async function readBoundedBytes({
  stream,
  maxBytes,
}: {
  stream: ReadableStream<Uint8Array>;
  maxBytes: number;
}): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("payload_too_large").catch(() => undefined);
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readBody({
  request,
  maxBytes,
}: {
  request: Request;
  maxBytes: number;
}): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isSafeInteger(declared) && declared > maxBytes) {
    throw tooLarge("The request is too large.");
  }
  try {
    const bytes = request.body
      ? await readBoundedBytes({ stream: request.body, maxBytes })
      : new Uint8Array(0);
    if (bytes === null) {
      throw tooLarge("The request is too large.");
    }
    return bytes;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw invalid("The request body could not be read.");
  }
}

function parseJson(text: string, field: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw invalid(`${field} must be valid JSON.`);
  }
}

function isFile(value: string | File | null): value is File {
  return value !== null && typeof value !== "string";
}

async function photoOf(value: string | File | null) {
  if (!isFile(value) || value.size === 0) {
    return null;
  }
  if (value.size > MAX_MEAL_PHOTO_BYTES) {
    throw tooLarge("The photo is too large.");
  }
  // The declared type is refused before the file is read.
  if (!MEAL_PHOTO_TYPES.includes(mediaType(value.type))) {
    throw wrongType(TYPE_MESSAGE);
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await value.arrayBuffer();
  } catch {
    throw invalid("The photo could not be read.");
  }
  return checkPhoto({ bytes, declaredType: value.type });
}

function entryFromForm(form: FormData): Record<string, unknown> {
  let body: Record<string, unknown> = {};
  for (const field of PAYLOAD_FIELDS) {
    const value = form.get(field);
    if (value === null) {
      continue;
    }
    if (typeof value !== "string") {
      throw invalid(`${field} must be JSON text.`);
    }
    const parsed = parseJson(value, field);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw invalid(`${field} must be a JSON object.`);
    }
    body = parsed as Record<string, unknown>;
    break;
  }
  for (const field of ENTRY_FIELDS) {
    const value = form.get(field);
    if (typeof value !== "string") {
      continue;
    }
    if (JSON_FIELDS.includes(field)) {
      body[field] = parseJson(value, field);
    } else if (body[field] === undefined) {
      body[field] =
        field === "confidence" && value.trim() !== "" ? Number(value) : value;
    }
  }
  // A multipart caller cannot point an entry at a key in the private bucket.
  // It sends a new file, or it leaves the photo as it is.
  delete body["photoKey"];
  delete body["photoMimeType"];
  delete body["photoSizeBytes"];
  return body;
}

/**
 * Read the body of a request to create or change an entry: JSON, or a
 * multipart form with the same fields in `payload` (or as single fields) and
 * the photo in `photo`. The body is counted as it is read.
 */
export async function readEntryRequest(
  request: Request,
): Promise<{ body: unknown; photo: PhotoUpload | null }> {
  const type = mediaType(request.headers.get("content-type") ?? "");
  if (type !== "multipart/form-data") {
    const bytes = await readBody({ request, maxBytes: MAX_JSON_BYTES });
    if (bytes.byteLength === 0) {
      throw invalid("The request body must be JSON.");
    }
    return {
      body: parseJson(new TextDecoder().decode(bytes), "The request body"),
      photo: null,
    };
  }
  const bytes = await readBody({ request, maxBytes: MAX_MULTIPART_BYTES });
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  let form: FormData;
  try {
    // A new request from the bytes: the Workers runtime cannot copy one whose body is read.
    form = await new Request(request.url, {
      method: request.method,
      headers,
      body: bytes,
    }).formData();
  } catch {
    throw invalid("The multipart form is invalid.");
  }
  const body = entryFromForm(form);
  const photoValue =
    PHOTO_FIELDS.map((field) => form.get(field)).find(
      (value) => value !== null,
    ) ?? null;
  return { body, photo: await photoOf(photoValue) };
}

function segment(value: string, fallback: string): string {
  return (
    value
      .normalize("NFKC")
      .replaceAll(/[^a-zA-Z0-9_-]+/g, "-")
      .replaceAll(/^-+|-+$/g, "")
      .slice(0, 100) || fallback
  );
}

/** A new key for a photo. The owner and the entry are in it, and a random part makes it new. */
export function newPhotoKey({
  ownerKey,
  mealId,
}: {
  ownerKey: string;
  mealId?: string | undefined;
}): string {
  return `${PHOTO_PREFIX}${segment(ownerKey, "owner")}/dashboard/${segment(mealId ?? "new", "new")}/${crypto.randomUUID()}`;
}

/** A key from a request is safe to look up when it cannot leave the photo namespace. */
export function isSafePhotoKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 1000 &&
    !key.startsWith("/") &&
    !key.includes("..") &&
    ![...key].some((character) => character.charCodeAt(0) < 32)
  );
}
