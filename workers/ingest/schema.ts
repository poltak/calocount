import type {
  Confidence,
  MealAnalysisResult,
  MealItem,
  MealTotals,
} from "./types";

export const ANALYSIS_SCHEMA_VERSION = "meal-analysis.v1";
export const PROMPT_VERSION = "meal-analysis-prompt.v1";

/**
 * The schema is sent to providers that support structured output. The Worker
 * still validates the response because provider-side schema enforcement can be
 * unavailable when a fallback model is selected.
 */
export const MEAL_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "items", "totals", "confidence", "assumptions", "questions"],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 500 },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "serving",
          "grams",
          "calories",
          "proteinGrams",
          "carbsGrams",
          "fatGrams",
          "confidence",
          "assumptions",
        ],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 160 },
          serving: { type: "string", minLength: 1, maxLength: 160 },
          grams: { type: ["number", "null"], minimum: 0, maximum: 100000 },
          calories: { type: "number", minimum: 0, maximum: 1000000 },
          proteinGrams: { type: "number", minimum: 0, maximum: 100000 },
          carbsGrams: { type: ["number", "null"], minimum: 0, maximum: 100000 },
          fatGrams: { type: ["number", "null"], minimum: 0, maximum: 100000 },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          assumptions: {
            type: "array",
            maxItems: 20,
            items: { type: "string", maxLength: 240 },
          },
        },
      },
    },
    totals: {
      type: "object",
      additionalProperties: false,
      required: ["calories", "proteinGrams", "carbsGrams", "fatGrams"],
      properties: {
        calories: { type: "number", minimum: 0, maximum: 50000000 },
        proteinGrams: { type: "number", minimum: 0, maximum: 5000000 },
        carbsGrams: { type: ["number", "null"], minimum: 0, maximum: 5000000 },
        fatGrams: { type: ["number", "null"], minimum: 0, maximum: 5000000 },
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    assumptions: {
      type: "array",
      maxItems: 20,
      items: { type: "string", maxLength: 240 },
    },
    questions: {
      type: "array",
      maxItems: 10,
      items: { type: "string", maxLength: 240 },
    },
  },
} as const;

export class MealAnalysisValidationError extends Error {
  constructor(message: string) {
    super(`Invalid meal analysis: ${message}`);
    this.name = "MealAnalysisValidationError";
  }
}
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MealAnalysisValidationError(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function assertExactKeys(record: JsonRecord, keys: readonly string[], path: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new MealAnalysisValidationError(`${path}.${key} is not allowed`);
    }
  }
  for (const key of keys) {
    if (!(key in record)) {
      throw new MealAnalysisValidationError(`${path}.${key} is required`);
    }
  }
}

function requiredString(record: JsonRecord, key: string, path: string, maxLength: number): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new MealAnalysisValidationError(`${path}.${key} must be a non-empty string`);
  }
  return value.trim();
}

function finiteNumber(
  record: JsonRecord,
  key: string,
  path: string,
  maximum: number,
  minimum = 0,
): number {
  const value = record[key];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new MealAnalysisValidationError(`${path}.${key} must be a finite non-negative number`);
  }
  return value;
}

function nullableNumber(
  record: JsonRecord,
  key: string,
  path: string,
  maximum: number,
): number | null {
  if (record[key] === null) {
    return null;
  }
  return finiteNumber(record, key, path, maximum);
}

function confidence(record: JsonRecord, key: string, path: string): Confidence {
  const value = record[key];
  if (value !== "high" && value !== "medium" && value !== "low") {
    throw new MealAnalysisValidationError(`${path}.${key} must be high, medium, or low`);
  }
  return value;
}

function stringArray(record: JsonRecord, key: string, path: string, maxItems: number): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new MealAnalysisValidationError(`${path}.${key} must be an array`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string" || item.length > 240) {
      throw new MealAnalysisValidationError(`${path}.${key}[${index}] must be a short string`);
    }
    return item.trim();
  });
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseItem(value: unknown, index: number): MealItem {
  const path = `items[${index}]`;
  const record = asRecord(value, path);
  assertExactKeys(
    record,
    [
      "name",
      "serving",
      "grams",
      "calories",
      "proteinGrams",
      "carbsGrams",
      "fatGrams",
      "confidence",
      "assumptions",
    ],
    path,
  );

  return {
    name: requiredString(record, "name", path, 160),
    serving: requiredString(record, "serving", path, 160),
    grams: nullableNumber(record, "grams", path, 100000),
    calories: round(finiteNumber(record, "calories", path, 1000000)),
    proteinGrams: round(finiteNumber(record, "proteinGrams", path, 100000)),
    carbsGrams: nullableNumber(record, "carbsGrams", path, 100000),
    fatGrams: nullableNumber(record, "fatGrams", path, 100000),
    confidence: confidence(record, "confidence", path),
    assumptions: stringArray(record, "assumptions", path, 20),
  };
}

function parseTotals(value: unknown): MealTotals {
  const path = "totals";
  const record = asRecord(value, path);
  assertExactKeys(record, ["calories", "proteinGrams", "carbsGrams", "fatGrams"], path);

  return {
    calories: round(finiteNumber(record, "calories", path, 50000000)),
    proteinGrams: round(finiteNumber(record, "proteinGrams", path, 5000000)),
    carbsGrams: nullableNumber(record, "carbsGrams", path, 5000000),
    fatGrams: nullableNumber(record, "fatGrams", path, 5000000),
  };
}

/**
 * Validate and normalise provider JSON. Totals are recalculated from items so
 * the value stored by the app does not depend on a model doing arithmetic.
 */
export function validateMealAnalysis(value: unknown): MealAnalysisResult {
  const record = asRecord(value, "root");
  assertExactKeys(record, ["summary", "items", "totals", "confidence", "assumptions", "questions"], "root");

  const rawItems = record.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 50) {
    throw new MealAnalysisValidationError("items must contain between 1 and 50 items");
  }

  const items = rawItems.map((item, index) => parseItem(item, index));
  // Parse totals even though the app recalculates them. This keeps the provider
  // contract strict and catches malformed responses early.
  parseTotals(record.totals);

  const carbs = items.every((item) => item.carbsGrams !== null)
    ? round(items.reduce((sum, item) => sum + (item.carbsGrams ?? 0), 0))
    : null;
  const fat = items.every((item) => item.fatGrams !== null)
    ? round(items.reduce((sum, item) => sum + (item.fatGrams ?? 0), 0))
    : null;

  return {
    summary: requiredString(record, "summary", "root", 500),
    items,
    totals: {
      calories: round(items.reduce((sum, item) => sum + item.calories, 0)),
      proteinGrams: round(items.reduce((sum, item) => sum + item.proteinGrams, 0)),
      carbsGrams: carbs,
      fatGrams: fat,
    },
    confidence: confidence(record, "confidence", "root"),
    assumptions: stringArray(record, "assumptions", "root", 20),
    questions: stringArray(record, "questions", "root", 10),
  };
}
