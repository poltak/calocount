import {
  NUTRIENT_KEYS,
  NUTRIENT_META,
  NUTRIENT_UPPER_LIMIT_KEYS,
  type NutrientKey,
  type NutrientUpperLimitKey,
} from "@app/common/features/entries/utils/nutrients";
import { parseNutrientProvenance } from "@app/common/features/entries/utils/nutrient-provenance";
import type { MealWithItems } from "../../entries/storage/types.js";
import type { EntryItemInput, EntryPatch } from "../../entries/types.js";
import { hasOnlyKeys, isObject } from "./json-object.js";
import { MAX_KCAL, MAX_MACRO, MAX_NAME_LENGTH } from "./limits.js";
import { McpToolError } from "./mcp-tool-error.js";
import { parseIsoDatetime, parseRequestId } from "./meal-request.js";
import { spreadMealTotals } from "./item-totals.js";
import { NUTRIENT_UPPER_LIMIT_META } from "./tool-schema-parts.js";

const TRACKED_NUTRIENT_KEYS = [
  ...NUTRIENT_KEYS,
  ...NUTRIENT_UPPER_LIMIT_KEYS,
] as const;
type TrackedNutrientKey = NutrientKey | NutrientUpperLimitKey;
const NUTRIENT_MAXIMA = new Map<string, number>(
  [...NUTRIENT_META, ...NUTRIENT_UPPER_LIMIT_META].map(({ key, maximum }) => [
    key,
    maximum,
  ]),
);
type NutrientChanges = Partial<Record<TrackedNutrientKey, number | null>>;

interface ItemCorrection {
  id: string;
  name?: string;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  nutrients?: NutrientChanges;
}

export interface MealCorrection {
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
}

function fail(message: string): never {
  throw new McpToolError("invalid_arguments", message);
}

function parseName(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > MAX_NAME_LENGTH
  ) {
    return fail(
      `${field} must be a non-empty string of at most ${MAX_NAME_LENGTH} characters.`,
    );
  }
  return value.trim();
}

function parseNumber({
  value,
  field,
  maximum,
}: {
  value: unknown;
  field: string;
  maximum: number;
}): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  ) {
    return fail(`${field} must be a finite number from 0 to ${maximum}.`);
  }
  return value;
}

function parseNutrients(value: unknown, field: string): NutrientChanges {
  if (!isObject(value) || Object.keys(value).length === 0) {
    return fail(`${field} must contain at least one supported nutrient.`);
  }
  if (!hasOnlyKeys(value, TRACKED_NUTRIENT_KEYS)) {
    return fail(`${field} contains an unsupported nutrient.`);
  }
  const result: NutrientChanges = {};
  for (const [key, amount] of Object.entries(value)) {
    result[key as TrackedNutrientKey] =
      amount === null
        ? null
        : parseNumber({
            value: amount,
            field: `${field}.${key}`,
            maximum: NUTRIENT_MAXIMA.get(key) ?? 0,
          });
  }
  return result;
}

function parseItemCorrection(value: unknown, index: number): ItemCorrection {
  const field = `patch.items[${index}]`;
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, [
      "id",
      "name",
      "kcal",
      "protein",
      "carbs",
      "fat",
      "nutrients",
    ])
  ) {
    return fail(`${field} contains unsupported fields.`);
  }
  const id = typeof value["id"] === "string" ? value["id"].trim() : "";
  if (!id || id.length > 120) {
    return fail(`${field}.id must be an existing item ID.`);
  }
  if (Object.keys(value).length === 1) {
    return fail(`${field} must contain a correction as well as id.`);
  }
  const correction: ItemCorrection = { id };
  if (value["name"] !== undefined) {
    correction.name = parseName(value["name"], `${field}.name`);
  }
  if (value["kcal"] !== undefined) {
    correction.kcal = parseNumber({
      value: value["kcal"],
      field: `${field}.kcal`,
      maximum: MAX_KCAL,
    });
  }
  if (value["protein"] !== undefined) {
    correction.protein = parseNumber({
      value: value["protein"],
      field: `${field}.protein`,
      maximum: MAX_MACRO,
    });
  }
  if (value["carbs"] !== undefined) {
    correction.carbs = parseNumber({
      value: value["carbs"],
      field: `${field}.carbs`,
      maximum: MAX_MACRO,
    });
  }
  if (value["fat"] !== undefined) {
    correction.fat = parseNumber({
      value: value["fat"],
      field: `${field}.fat`,
      maximum: MAX_MACRO,
    });
  }
  if (value["nutrients"] !== undefined) {
    correction.nutrients = parseNutrients(
      value["nutrients"],
      `${field}.nutrients`,
    );
  }
  return correction;
}

/** The arguments of `update_meal`. Nothing changes when one field is wrong. */
export function parseMealCorrection(value: unknown): MealCorrection {
  if (!isObject(value) || !hasOnlyKeys(value, ["request_id", "patch"])) {
    return fail("Provide request_id and patch only.");
  }
  let requestId: string;
  try {
    requestId = parseRequestId(value["request_id"]);
  } catch {
    return fail("request_id must be the UUID of an existing meal.");
  }
  const given = value["patch"];
  const patchKeys = [
    "name",
    "eaten_at",
    "kcal",
    "protein",
    "carbs",
    "fat",
    "nutrients",
    "items",
  ] as const;
  if (
    !isObject(given) ||
    Object.keys(given).length === 0 ||
    !hasOnlyKeys(given, patchKeys)
  ) {
    return fail("patch must contain one or more supported meal corrections.");
  }

  const patch: MealCorrection["patch"] = {};
  if (given["name"] !== undefined) {
    patch.name = parseName(given["name"], "patch.name");
  }
  if (given["eaten_at"] !== undefined) {
    if (typeof given["eaten_at"] !== "string") {
      return fail(
        "patch.eaten_at must be a valid ISO date and time with a timezone.",
      );
    }
    try {
      patch.eatenAt = parseIsoDatetime(given["eaten_at"]);
    } catch {
      return fail(
        "patch.eaten_at must be a valid ISO date and time with a timezone.",
      );
    }
  }
  if (given["kcal"] !== undefined) {
    patch.kcal = parseNumber({
      value: given["kcal"],
      field: "patch.kcal",
      maximum: MAX_KCAL,
    });
  }
  if (given["protein"] !== undefined) {
    patch.protein = parseNumber({
      value: given["protein"],
      field: "patch.protein",
      maximum: MAX_MACRO,
    });
  }
  if (given["carbs"] !== undefined) {
    patch.carbs = parseNumber({
      value: given["carbs"],
      field: "patch.carbs",
      maximum: MAX_MACRO,
    });
  }
  if (given["fat"] !== undefined) {
    patch.fat = parseNumber({
      value: given["fat"],
      field: "patch.fat",
      maximum: MAX_MACRO,
    });
  }
  if (given["nutrients"] !== undefined) {
    patch.nutrients = parseNutrients(given["nutrients"], "patch.nutrients");
  }
  if (given["items"] !== undefined) {
    const items = given["items"];
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
      return fail("patch.items must contain one or more item corrections.");
    }
    patch.items = items.map(parseItemCorrection);
    if (
      new Set(patch.items.map((item) => item.id)).size !== patch.items.length
    ) {
      return fail("patch.items cannot contain duplicate item IDs.");
    }
  }

  const mealTotalsChanged = ["kcal", "protein", "carbs", "fat"].some(
    (key) => given[key] !== undefined,
  );
  const itemTotalsChanged =
    patch.items?.some(
      (item) =>
        item.kcal !== undefined ||
        item.protein !== undefined ||
        item.carbs !== undefined ||
        item.fat !== undefined,
    ) ?? false;
  if (mealTotalsChanged && itemTotalsChanged) {
    return fail(
      "Change meal totals or item macros in one update, but not both.",
    );
  }
  const mealNutrients = patch.nutrients;
  if (
    mealNutrients &&
    patch.items?.some((item) =>
      Object.keys(item.nutrients ?? {}).some((key) =>
        Object.hasOwn(mealNutrients, key),
      ),
    )
  ) {
    return fail(
      "Change a nutrient at meal level or item level in one update, but not both.",
    );
  }
  return { requestId, patch };
}

function itemInputOf(item: MealWithItems["items"][number]): EntryItemInput {
  const nutrients = Object.fromEntries(
    TRACKED_NUTRIENT_KEYS.map((key) => [key, item[key] ?? null]),
  ) as Record<TrackedNutrientKey, number | null>;
  let rawProvenance: unknown = {};
  try {
    rawProvenance = item.nutrientProvenanceJson
      ? JSON.parse(item.nutrientProvenanceJson)
      : {};
  } catch {
    rawProvenance = {};
  }
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
    nutrientProvenance: parseNutrientProvenance(rawProvenance, nutrients),
    ...nutrients,
  };
}

/** A corrected value is a manual one, and a value cleared to unknown has no origin. */
function applyNutrientChanges(item: EntryItemInput, changes: NutrientChanges) {
  Object.assign(item, changes);
  const provenance = { ...item.nutrientProvenance };
  for (const key of NUTRIENT_KEYS) {
    if (!(key in changes)) {
      continue;
    }
    if (changes[key] === null) {
      delete provenance[key];
    } else {
      provenance[key] = "manual";
    }
  }
  item.nutrientProvenance = provenance;
}

/**
 * The edit of an entry that a correction asks for. The totals of the entry
 * follow its items, so a change of a total changes the items.
 */
export function entryPatchOf({
  existing,
  correction,
}: {
  existing: MealWithItems;
  correction: MealCorrection["patch"];
}): EntryPatch {
  if (correction.nutrients && existing.items.length !== 1) {
    return fail("patch.nutrients can be used only when the meal has one item.");
  }
  let items = existing.items.map(itemInputOf);
  const indexes = new Map(items.map((item, index) => [item.id, index]));
  for (const item of correction.items ?? []) {
    if (!indexes.has(item.id)) {
      return fail("patch.items contains an unknown item ID.");
    }
  }

  const mealTotals: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  } = {};
  if (correction.kcal !== undefined) {
    mealTotals.calories = correction.kcal;
  }
  if (correction.protein !== undefined) {
    mealTotals.protein = correction.protein;
  }
  if (correction.carbs !== undefined) {
    mealTotals.carbs = correction.carbs;
  }
  if (correction.fat !== undefined) {
    mealTotals.fat = correction.fat;
  }
  const hasMealTotals = Object.keys(mealTotals).length > 0;
  if (hasMealTotals) {
    if (items.length === 0) {
      return fail(
        "Meal totals cannot be changed because this meal has no items.",
      );
    }
    items = spreadMealTotals({
      items: items.map((item) => ({
        ...item,
        calories: item.calories ?? 0,
        proteinG: item.proteinG ?? 0,
        carbsG: item.carbsG ?? 0,
        fatG: item.fatG ?? 0,
      })),
      changes: mealTotals,
    });
  }
  const first = items[0];
  if (correction.nutrients && first) {
    applyNutrientChanges(first, correction.nutrients);
  }
  for (const change of correction.items ?? []) {
    const item = items[indexes.get(change.id) ?? -1];
    if (!item) {
      continue;
    }
    if (change.name !== undefined) {
      item.name = change.name;
    }
    if (change.kcal !== undefined) {
      item.calories = change.kcal;
    }
    if (change.protein !== undefined) {
      item.proteinG = change.protein;
    }
    if (change.carbs !== undefined) {
      item.carbsG = change.carbs;
    }
    if (change.fat !== undefined) {
      item.fatG = change.fat;
    }
    if (change.nutrients) {
      applyNutrientChanges(item, change.nutrients);
    }
  }

  const patch: EntryPatch = { revisionSource: "mcp" };
  if (correction.name !== undefined) {
    patch.caption = correction.name;
  }
  if (correction.eatenAt !== undefined) {
    patch.consumedAt = correction.eatenAt;
  }
  if (hasMealTotals || correction.nutrients || correction.items) {
    patch.items = items;
  }
  return patch;
}
