import { NUTRIENT_UPPER_LIMIT_KEYS } from "../../domain/nutrients";

export const MAX_NUTRITION_RANGE_DAYS = 366;
export const DEFAULT_NUTRITION_PAGE_SIZE = 50;
export const MAX_NUTRITION_PAGE_SIZE = 100;

const DAY_MS = 86_400_000;
const MAX_CURSOR_LENGTH = 4096;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export class NutritionReadInputError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "NutritionReadInputError";
  }
}

export type NutritionDateRange = {
  startDate: string;
  endDate: string;
  from: number;
  to: number;
  dayCount: number;
};

export type NutritionHistoryCursor = {
  consumedAt: number;
  id: string;
};

export type NutritionHistoryInput = NutritionDateRange & {
  pageSize: number;
  cursor: NutritionHistoryCursor | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function parseDate(value: unknown, field: string): { date: string; timestamp: number } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new NutritionReadInputError("invalid_date", `${field} must be a UTC date in YYYY-MM-DD format.`);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new NutritionReadInputError("invalid_date", `${field} must be a real UTC calendar date.`);
  }
  return { date: value, timestamp };
}

export function parseNutritionDateRange(value: unknown, allowedKeys: string[] = ["start_date", "end_date"]): NutritionDateRange {
  if (!isObject(value) || !hasOnlyKeys(value, allowedKeys)) {
    throw new NutritionReadInputError("invalid_arguments", "Provide only the supported nutrition query fields.");
  }
  const start = parseDate(value.start_date, "start_date");
  const end = parseDate(value.end_date, "end_date");
  if (start.timestamp > end.timestamp) {
    throw new NutritionReadInputError("invalid_date_range", "start_date must be on or before end_date.");
  }
  const dayCount = Math.floor((end.timestamp - start.timestamp) / DAY_MS) + 1;
  if (dayCount > MAX_NUTRITION_RANGE_DAYS) {
    throw new NutritionReadInputError("date_range_too_large", `The date range can include at most ${MAX_NUTRITION_RANGE_DAYS} days.`);
  }
  return {
    startDate: start.date,
    endDate: end.date,
    from: start.timestamp,
    to: end.timestamp + DAY_MS,
    dayCount,
  };
}

function toBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("invalid_cursor");
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function cursorKey(ownerKey: string, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  const keyBytes = await crypto.subtle.digest("SHA-256", encoder.encode(ownerKey));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [usage]);
}

type CursorPayload = {
  version: 1;
  startDate: string;
  endDate: string;
  pageSize: number;
  consumedAt: number;
  id: string;
};

export async function encodeNutritionHistoryCursor(ownerKey: string, input: NutritionHistoryInput, cursor: NutritionHistoryCursor): Promise<string> {
  const payload: CursorPayload = {
    version: 1,
    startDate: input.startDate,
    endDate: input.endDate,
    pageSize: input.pageSize,
    consumedAt: cursor.consumedAt,
    id: cursor.id,
  };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await cursorKey(ownerKey, "encrypt"),
    encoder.encode(JSON.stringify(payload)),
  ));
  const token = new Uint8Array(iv.length + encrypted.length);
  token.set(iv);
  token.set(encrypted, iv.length);
  return toBase64Url(token);
}

async function decodeNutritionHistoryCursor(ownerKey: string, value: string): Promise<unknown> {
  if (!value || value.length > MAX_CURSOR_LENGTH) throw new Error("invalid_cursor");
  const bytes = fromBase64Url(value);
  if (bytes.length < 29) throw new Error("invalid_cursor");
  const iv = bytes.slice(0, 12);
  const encrypted = bytes.slice(12);
  const decoded = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    await cursorKey(ownerKey, "decrypt"),
    encrypted,
  );
  return JSON.parse(decoder.decode(decoded)) as unknown;
}

function isCursorPayload(value: unknown): value is CursorPayload {
  return isObject(value)
    && hasOnlyKeys(value, ["version", "startDate", "endDate", "pageSize", "consumedAt", "id"])
    && value.version === 1
    && typeof value.startDate === "string"
    && typeof value.endDate === "string"
    && typeof value.pageSize === "number"
    && Number.isInteger(value.pageSize)
    && typeof value.consumedAt === "number"
    && Number.isSafeInteger(value.consumedAt)
    && typeof value.id === "string"
    && value.id.length > 0
    && value.id.length <= 200;
}

export async function parseNutritionHistoryInput(ownerKey: string, value: unknown): Promise<NutritionHistoryInput> {
  if (!isObject(value) || !hasOnlyKeys(value, ["start_date", "end_date", "page_size", "cursor"])) {
    throw new NutritionReadInputError("invalid_arguments", "Provide start_date and end_date, with optional page_size and cursor.");
  }
  const range = parseNutritionDateRange(value, ["start_date", "end_date", "page_size", "cursor"]);
  const pageSize = value.page_size === undefined ? DEFAULT_NUTRITION_PAGE_SIZE : value.page_size;
  if (typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_NUTRITION_PAGE_SIZE) {
    throw new NutritionReadInputError("invalid_page_size", `page_size must be an integer from 1 to ${MAX_NUTRITION_PAGE_SIZE}.`);
  }

  let cursor: NutritionHistoryCursor | null = null;
  if (value.cursor !== undefined) {
    if (typeof value.cursor !== "string") {
      throw new NutritionReadInputError("invalid_cursor", "cursor must be an opaque cursor returned by get_nutrition_history.");
    }
    try {
      const decoded = await decodeNutritionHistoryCursor(ownerKey, value.cursor);
      if (!isCursorPayload(decoded)
        || decoded.startDate !== range.startDate
        || decoded.endDate !== range.endDate
        || decoded.pageSize !== pageSize
        || decoded.consumedAt < range.from
        || decoded.consumedAt >= range.to) {
        throw new Error("invalid_cursor");
      }
      cursor = { consumedAt: decoded.consumedAt, id: decoded.id };
    } catch {
      throw new NutritionReadInputError("invalid_cursor", "cursor is invalid or does not match this date range and page_size.");
    }
  }

  return { ...range, pageSize, cursor };
}

export function parseNutritionSummaryInput(value: unknown): NutritionDateRange {
  return parseNutritionDateRange(value);
}

export const SOURCE_FORM_OUTPUT_KEYS = NUTRIENT_UPPER_LIMIT_KEYS;
