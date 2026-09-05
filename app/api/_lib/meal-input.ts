import { ApiError, optionalNumber, requireString } from "./http";
import { NUTRIENT_KEYS, NUTRIENT_META, type PartialNutrientValues, type NutrientKey } from "../../../domain/nutrients";
import type { MealInput, MealItemInput, MealPatch } from "../../../db/repository";

const MAX_ITEMS = 100;

function optionalString(value: unknown, field: string, max = 2_000): string | undefined {
  if (value == null) return undefined;
  return requireString(value, field, { max, optional: true });
}

function parseConsumedAt(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(new Date(value).getTime())) return value;
  if (typeof value !== "string") throw new ApiError(400, "invalid_field", "consumedAt must be an ISO date or timestamp.");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ApiError(400, "invalid_field", "consumedAt must be a valid date.");
  return parsed;
}

function parseNullableNutrient(
  item: Record<string, unknown>,
  key: NutrientKey,
  field: string,
): number | null | undefined {
  if (!(key in item)) return undefined;
  if (item[key] === null) return null;
  const maximum = NUTRIENT_META.find((entry) => entry.key === key)?.maximum ?? 100_000;
  const value = optionalNumber(item[key], field, { min: 0, max: maximum });
  return value === undefined ? undefined : value;
}

function parseItems(value: unknown): MealItemInput[] {
  if (!Array.isArray(value)) throw new ApiError(400, "invalid_field", "items must be an array.");
  if (value.length > MAX_ITEMS) throw new ApiError(400, "invalid_field", "items has too many entries.");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ApiError(400, "invalid_field", `items[${index}] must be an object.`);
    }
    const item = entry as Record<string, unknown>;
    const name = requireString(item.name, `items[${index}].name`, { max: 200 });
    const quantity = optionalNumber(item.quantity, `items[${index}].quantity`, { min: 0, max: 1_000 });
    const calories = optionalNumber(item.calories, `items[${index}].calories`, { min: 0, max: 100_000 });
    const proteinG = optionalNumber(item.proteinG, `items[${index}].proteinG`, { min: 0, max: 10_000 });
    const carbsG = optionalNumber(item.carbsG, `items[${index}].carbsG`, { min: 0, max: 10_000 });
    const fatG = optionalNumber(item.fatG, `items[${index}].fatG`, { min: 0, max: 10_000 });
    const confidence = optionalNumber(item.confidence, `items[${index}].confidence`, { min: 0, max: 1 });
    const nutrients = {} as PartialNutrientValues;
    for (const key of NUTRIENT_KEYS) {
      const value = parseNullableNutrient(item, key, `items[${index}].${key}`);
      if (value !== undefined) nutrients[key] = value;
    }
    return {
      id: optionalString(item.id, `items[${index}].id`, 100),
      name: name ?? "",
      quantity,
      unit: optionalString(item.unit, `items[${index}].unit`, 50),
      calories,
      proteinG,
      carbsG,
      fatG,
      confidence,
      source: optionalString(item.source, `items[${index}].source`, 50),
      ...nutrients,
    };
  });
}

export function parseMealInput(body: Record<string, unknown>, partial?: false): MealInput;
export function parseMealInput(body: Record<string, unknown>, partial: true): MealPatch;
export function parseMealInput(body: Record<string, unknown>, partial = false): MealInput | MealPatch {
  const input: MealInput = {};
  if (!partial || body.consumedAt !== undefined) input.consumedAt = parseConsumedAt(body.consumedAt) ?? Date.now();
  if (!partial || body.caption !== undefined) input.caption = optionalString(body.caption, "caption", 4_000) ?? "";
  if (body.id !== undefined) input.id = optionalString(body.id, "id", 120);
  if (body.source !== undefined) input.source = optionalString(body.source, "source", 50);
  if (body.mealType !== undefined) input.mealType = body.mealType == null ? null : optionalString(body.mealType, "mealType", 50) ?? null;
  if (body.status !== undefined) {
    const status = optionalString(body.status, "status", 30);
    if (status && !["pending", "needs_input", "complete", "failed", "archived"].includes(status)) {
      throw new ApiError(400, "invalid_field", "status is not valid.");
    }
    input.status = status;
  }
  if (body.photoKey !== undefined) input.photoKey = body.photoKey == null ? null : optionalString(body.photoKey, "photoKey", 500) ?? null;
  if (body.photoMimeType !== undefined) input.photoMimeType = body.photoMimeType == null ? null : optionalString(body.photoMimeType, "photoMimeType", 100) ?? null;
  if (body.photoSizeBytes !== undefined) input.photoSizeBytes = body.photoSizeBytes == null ? null : optionalNumber(body.photoSizeBytes, "photoSizeBytes", { min: 0, max: 50_000_000 }) ?? null;
  if (body.confidence !== undefined) input.confidence = body.confidence == null ? null : optionalNumber(body.confidence, "confidence", { min: 0, max: 1 }) ?? null;
  if (body.assumptions !== undefined) {
    if (!Array.isArray(body.assumptions)) throw new ApiError(400, "invalid_field", "assumptions must be an array.");
    input.assumptions = body.assumptions.slice(0, 100);
  }
  if (body.notes !== undefined) input.notes = body.notes == null ? null : optionalString(body.notes, "notes", 4_000) ?? null;
  if (!partial || body.items !== undefined) input.items = parseItems(body.items ?? []);
  if (body.reason !== undefined) (input as MealPatch).reason = optionalString(body.reason, "reason", 500);
  return input;
}
