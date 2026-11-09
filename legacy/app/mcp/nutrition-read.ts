import { NUTRIENT_UPPER_LIMIT_KEYS } from "../../domain/nutrients";
import { hasOnlyKeys, isObject } from "./objects";

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

/** Inclusive calendar dates. The repository turns them into moments in the owner's saved timezone. */
export type NutritionDateRange = {
  startDate: string;
  endDate: string;
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

function parseDate(value: unknown, field: string): { date: string; timestamp: number } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new NutritionReadInputError("invalid_date", `${field} must be a date in YYYY-MM-DD format.`);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new NutritionReadInputError("invalid_date", `${field} must be a real calendar date.`);
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
  return { startDate: start.date, endDate: end.date, dayCount };
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

type CursorPayload = {
  version: 2;
  startDate: string;
  endDate: string;
  pageSize: number;
  consumedAt: number;
  id: string;
};

/**
 * Encode the position after the last meal of a page. The cursor is opaque to
 * the model but not secret: it only tells the owner-scoped query where to
 * continue, and it is checked against the dates and page size it was made for.
 */
export function encodeNutritionHistoryCursor(input: NutritionHistoryInput, cursor: NutritionHistoryCursor): string {
  const payload: CursorPayload = {
    version: 2,
    startDate: input.startDate,
    endDate: input.endDate,
    pageSize: input.pageSize,
    consumedAt: cursor.consumedAt,
    id: cursor.id,
  };
  return toBase64Url(encoder.encode(JSON.stringify(payload)));
}

function decodeNutritionHistoryCursor(value: string): unknown {
  if (!value || value.length > MAX_CURSOR_LENGTH) throw new Error("invalid_cursor");
  return JSON.parse(decoder.decode(fromBase64Url(value))) as unknown;
}

function isCursorPayload(value: unknown): value is CursorPayload {
  return isObject(value)
    && hasOnlyKeys(value, ["version", "startDate", "endDate", "pageSize", "consumedAt", "id"])
    && value.version === 2
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

export function parseNutritionHistoryInput(value: unknown): NutritionHistoryInput {
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
      const decoded = decodeNutritionHistoryCursor(value.cursor);
      if (!isCursorPayload(decoded)
        || decoded.startDate !== range.startDate
        || decoded.endDate !== range.endDate
        || decoded.pageSize !== pageSize) {
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

export function parseWeightHistoryInput(value: unknown): NutritionDateRange {
  return parseNutritionDateRange(value);
}

export const SOURCE_FORM_OUTPUT_KEYS = NUTRIENT_UPPER_LIMIT_KEYS;
