import { parseNutrientProvenance } from "../../domain/nutrient-provenance";
import {
  NUTRIENT_KEYS,
  NUTRIENT_META,
  NUTRIENT_UPPER_LIMIT_KEYS,
  NUTRIENT_UPPER_LIMIT_META,
  type NutrientKey,
  type NutrientUpperLimitKey,
} from "../../domain/nutrients";
import {
  findMealByExternalRequestId,
  updateMeal,
  type AppDb,
  type MealItemInput,
  type MealPatch,
  type MealWithItems,
} from "../../db/repository";
import { updateMealItemTotals } from "../meal-item-totals";
import { parseExternalMealRequestId, parseIsoDatetime } from "../api/_lib/add-meal";

const TRACKED_NUTRIENT_KEYS = [...NUTRIENT_KEYS, ...NUTRIENT_UPPER_LIMIT_KEYS] as const;
type TrackedNutrientKey = NutrientKey | NutrientUpperLimitKey;
type NutrientChanges = Partial<Record<TrackedNutrientKey, number | null>>;
type ItemCorrection = {
  id: string;
  name?: string;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  nutrients?: NutrientChanges;
};

export type McpMealUpdateInput = {
  requestId: string;
  patch: {
    name?: string;
    eatenAt?: number;
    kcal?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    nutrients?: NutrientChanges;
    items?: ItemCorrection[];
  };
};

export class MealUpdateInputError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "MealUpdateInputError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(message: string): never {
  throw new MealUpdateInputError("invalid_arguments", message);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseName(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 200) {
    return fail(field + " must be a non-empty string of at most 200 characters.");
  }
  return value.trim();
}

function parseNumber({ value, field, maximum }: {
  value: unknown;
  field: string;
  maximum: number;
}): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    return fail(field + " must be a finite number from 0 to " + maximum + ".");
  }
  return value;
}

function parseNutrients(value: unknown, field: string): NutrientChanges {
  if (!isObject(value) || Object.keys(value).length === 0) {
    return fail(field + " must contain at least one supported nutrient.");
  }
  if (!hasOnlyKeys(value, TRACKED_NUTRIENT_KEYS)) {
    return fail(field + " contains an unsupported nutrient.");
  }
  const maxima = new Map<string, number>(
    [...NUTRIENT_META, ...NUTRIENT_UPPER_LIMIT_META].map(({ key, maximum }) => [key, maximum]),
  );
  const result: NutrientChanges = {};
  for (const [key, amount] of Object.entries(value)) {
    if (amount !== null) result[key as TrackedNutrientKey] = parseNumber({ value: amount, field: field + "." + key, maximum: maxima.get(key) ?? 0 });
    else result[key as TrackedNutrientKey] = null;
  }
  return result;
}

function parseItemCorrection(value: unknown, index: number): ItemCorrection {
  const field = "patch.items[" + index + "]";
  if (!isObject(value) || !hasOnlyKeys(value, ["id", "name", "kcal", "protein", "carbs", "fat", "nutrients"])) {
    return fail(field + " contains unsupported fields.");
  }
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id || id.length > 120) return fail(field + ".id must be an existing item ID.");
  if (Object.keys(value).length === 1) return fail(field + " must contain a correction as well as id.");
  const correction: ItemCorrection = { id };
  if (value.name !== undefined) correction.name = parseName(value.name, field + ".name");
  if (value.kcal !== undefined) correction.kcal = parseNumber({ value: value.kcal, field: field + ".kcal", maximum: 100_000 });
  if (value.protein !== undefined) correction.protein = parseNumber({ value: value.protein, field: field + ".protein", maximum: 10_000 });
  if (value.carbs !== undefined) correction.carbs = parseNumber({ value: value.carbs, field: field + ".carbs", maximum: 10_000 });
  if (value.fat !== undefined) correction.fat = parseNumber({ value: value.fat, field: field + ".fat", maximum: 10_000 });
  if (value.nutrients !== undefined) correction.nutrients = parseNutrients(value.nutrients, field + ".nutrients");
  return correction;
}

export function parseMcpMealUpdateInput(value: unknown): McpMealUpdateInput {
  if (!isObject(value) || !hasOnlyKeys(value, ["request_id", "patch"])) {
    return fail("Provide request_id and patch only.");
  }
  let requestId: string;
  try {
    requestId = parseExternalMealRequestId(value.request_id);
  } catch {
    return fail("request_id must be the UUID of an existing meal.");
  }
  const valuePatch = value.patch;
  const patchKeys = ["name", "eaten_at", "kcal", "protein", "carbs", "fat", "nutrients", "items"] as const;
  if (!isObject(valuePatch) || Object.keys(valuePatch).length === 0 || !hasOnlyKeys(valuePatch, patchKeys)) {
    return fail("patch must contain one or more supported meal corrections.");
  }

  const patch: McpMealUpdateInput["patch"] = {};
  if (valuePatch.name !== undefined) patch.name = parseName(valuePatch.name, "patch.name");
  if (valuePatch.eaten_at !== undefined) {
    if (typeof valuePatch.eaten_at !== "string") {
      return fail("patch.eaten_at must be a valid ISO date and time with a timezone.");
    }
    try {
      patch.eatenAt = parseIsoDatetime(valuePatch.eaten_at);
    } catch {
      return fail("patch.eaten_at must be a valid ISO date and time with a timezone.");
    }
  }
  if (valuePatch.kcal !== undefined) patch.kcal = parseNumber({ value: valuePatch.kcal, field: "patch.kcal", maximum: 100_000 });
  if (valuePatch.protein !== undefined) patch.protein = parseNumber({ value: valuePatch.protein, field: "patch.protein", maximum: 10_000 });
  if (valuePatch.carbs !== undefined) patch.carbs = parseNumber({ value: valuePatch.carbs, field: "patch.carbs", maximum: 10_000 });
  if (valuePatch.fat !== undefined) patch.fat = parseNumber({ value: valuePatch.fat, field: "patch.fat", maximum: 10_000 });
  if (valuePatch.nutrients !== undefined) patch.nutrients = parseNutrients(valuePatch.nutrients, "patch.nutrients");
  if (valuePatch.items !== undefined) {
    if (!Array.isArray(valuePatch.items) || valuePatch.items.length === 0 || valuePatch.items.length > 100) {
      return fail("patch.items must contain one or more item corrections.");
    }
    patch.items = valuePatch.items.map(parseItemCorrection);
    if (new Set(patch.items.map((item) => item.id)).size !== patch.items.length) {
      return fail("patch.items cannot contain duplicate item IDs.");
    }
  }

  const mealTotalsChanged = ["kcal", "protein", "carbs", "fat"].some((key) => valuePatch[key] !== undefined);
  const itemTotalsChanged = patch.items?.some((item) => (
    item.kcal !== undefined || item.protein !== undefined || item.carbs !== undefined || item.fat !== undefined
  )) ?? false;
  if (mealTotalsChanged && itemTotalsChanged) {
    return fail("Change meal totals or item macros in one update, but not both.");
  }
  if (patch.nutrients && patch.items?.some((item) => (
    Object.keys(item.nutrients ?? {}).some((key) => Object.hasOwn(patch.nutrients!, key))
  ))) {
    return fail("Change a nutrient at meal level or item level in one update, but not both.");
  }

  return { requestId, patch };
}

function rowNutrientValues(item: MealWithItems["items"][number]): Record<TrackedNutrientKey, number | null> {
  const row = item as unknown as Record<string, number | null>;
  return Object.fromEntries(TRACKED_NUTRIENT_KEYS.map((key) => [key, row[key] ?? null])) as Record<TrackedNutrientKey, number | null>;
}

function rowProvenance(item: MealWithItems["items"][number], nutrients: Record<TrackedNutrientKey, number | null>) {
  try {
    return parseNutrientProvenance(item.nutrientProvenanceJson ? JSON.parse(item.nutrientProvenanceJson) : {}, nutrients);
  } catch {
    return {};
  }
}

function mealItemInputs(meal: MealWithItems): MealItemInput[] {
  return meal.items.map((item) => {
    const nutrients = rowNutrientValues(item);
    return {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      confidence: item.confidence,
      source: item.source,
      nutrientProvenance: rowProvenance(item, nutrients),
      ...nutrients,
    };
  });
}

function applyNutrientChanges(item: MealItemInput, changes: NutrientChanges) {
  Object.assign(item, changes);
  const provenance = { ...(item.nutrientProvenance ?? {}) };
  for (const key of NUTRIENT_KEYS) {
    if (!(key in changes)) continue;
    if (changes[key] === null) delete provenance[key];
    else provenance[key] = "manual";
  }
  item.nutrientProvenance = provenance;
}

/** Update one completed meal that belongs to the signed-in owner. */
export async function updateMcpMealByRequestId({ db, ownerKey, input }: {
  db: AppDb;
  ownerKey: string;
  input: McpMealUpdateInput;
}): Promise<MealWithItems | null> {
  const existing = await findMealByExternalRequestId(db, ownerKey, input.requestId);
  if (!existing || existing.meal.status !== "complete") return null;
  if (input.patch.nutrients && existing.items.length !== 1) {
    return fail("patch.nutrients can be used only when the meal has one item.");
  }

  const itemInputs = mealItemInputs(existing);
  const itemIndexes = new Map(itemInputs.map((item, index) => [item.id as string, index]));
  for (const correction of input.patch.items ?? []) {
    if (!itemIndexes.has(correction.id)) return fail("patch.items contains an unknown item ID.");
  }

  const mealTotals: { calories?: number; protein?: number; carbs?: number; fat?: number } = {};
  if (input.patch.kcal !== undefined) mealTotals.calories = input.patch.kcal;
  if (input.patch.protein !== undefined) mealTotals.protein = input.patch.protein;
  if (input.patch.carbs !== undefined) mealTotals.carbs = input.patch.carbs;
  if (input.patch.fat !== undefined) mealTotals.fat = input.patch.fat;
  const hasMealTotals = Object.keys(mealTotals).length > 0;
  if (hasMealTotals) {
    if (itemInputs.length === 0) return fail("Meal totals cannot be changed because this meal has no items.");
    const totals = updateMealItemTotals({
      items: itemInputs.map((item) => ({
        id: item.id,
        name: item.name,
        calories: item.calories,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
        nutrients: Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, item[key] ?? null])),
      })),
      changes: mealTotals,
    });
    for (const [index, total] of totals.entries()) {
      itemInputs[index]!.calories = total.calories ?? itemInputs[index]!.calories;
      itemInputs[index]!.proteinG = total.proteinG ?? itemInputs[index]!.proteinG;
      itemInputs[index]!.carbsG = total.carbsG ?? itemInputs[index]!.carbsG;
      itemInputs[index]!.fatG = total.fatG ?? itemInputs[index]!.fatG;
    }
  }

  if (input.patch.nutrients) {
    applyNutrientChanges(itemInputs[0]!, input.patch.nutrients);
  }
  for (const correction of input.patch.items ?? []) {
    const item = itemInputs[itemIndexes.get(correction.id)!]!;
    if (correction.name !== undefined) item.name = correction.name;
    if (correction.kcal !== undefined) item.calories = correction.kcal;
    if (correction.protein !== undefined) item.proteinG = correction.protein;
    if (correction.carbs !== undefined) item.carbsG = correction.carbs;
    if (correction.fat !== undefined) item.fatG = correction.fat;
    if (correction.nutrients) applyNutrientChanges(item, correction.nutrients);
  }

  const patch: MealPatch = {};
  if (input.patch.name !== undefined) patch.caption = input.patch.name;
  if (input.patch.eatenAt !== undefined) patch.consumedAt = input.patch.eatenAt;
  if (hasMealTotals || input.patch.nutrients || input.patch.items) patch.items = itemInputs;
  return updateMeal(db, ownerKey, existing.meal.id, patch, "mcp");
}

export function mcpUpdatedMealPayload(meal: MealWithItems, requestId: string) {
  return {
    status: "updated",
    meal_id: meal.meal.id,
    request_id: meal.meal.externalRequestId ?? requestId,
    name: meal.meal.caption,
    kcal: meal.meal.totalCalories,
    protein: meal.meal.totalProteinG,
    carbs: meal.meal.totalCarbsG,
    fat: meal.meal.totalFatG,
    eaten_at: new Date(meal.meal.consumedAt).toISOString(),
    has_image: Boolean(meal.meal.photoKey),
    items: meal.items.map((item) => {
      const row = item as unknown as Record<string, number | null>;
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        kcal: item.calories,
        protein: item.proteinG,
        carbs: item.carbsG,
        fat: item.fatG,
        nutrients: Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, row[key] ?? null])),
        sourceFormAmounts: Object.fromEntries(NUTRIENT_UPPER_LIMIT_KEYS.map((key) => [key, row[key] ?? null])),
      };
    }),
  };
}
