import {
  NUTRIENT_KEYS,
  NUTRIENT_UPPER_LIMIT_KEYS,
  nullableNutrientValue,
  type NutrientKey,
  type NutrientUpperLimitKey,
} from "@app/common/features/entries/utils/nutrients";
import {
  parseNutrientProvenance,
  type NutrientProvenanceMap,
} from "@app/common/features/entries/utils/nutrient-provenance";
import type {
  MealItemRow,
  MealWithItems,
  NewMealItem,
  NewMealLog,
  SavedEntryRow,
} from "../storage/types.js";
import type { EntryInput, EntryItemInput } from "./entry-input.js";
import { newId } from "./ids.js";

const TRACKED_KEYS = [...NUTRIENT_KEYS, ...NUTRIENT_UPPER_LIMIT_KEYS] as const;

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseJson(value: string | null, fallback: unknown): unknown {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function itemNutrients(
  item: Partial<Record<NutrientKey | NutrientUpperLimitKey, unknown>>,
) {
  const nutrients = {} as Record<
    NutrientKey | NutrientUpperLimitKey,
    number | null
  >;
  for (const key of TRACKED_KEYS) {
    nutrients[key] = nullableNutrientValue(item[key]);
  }
  return nutrients;
}

function storedProvenance(item: MealItemRow): NutrientProvenanceMap {
  return parseNutrientProvenance(
    parseJson(item.nutrientProvenanceJson, null),
    item,
  );
}

function buildItemRow({
  item,
  ownerKey,
  mealId,
  timestamp,
}: {
  item: EntryItemInput;
  ownerKey: string;
  mealId: string;
  timestamp: number;
}): NewMealItem {
  const nutrients = itemNutrients(item);
  const provenance = parseNutrientProvenance(
    item.nutrientProvenance,
    nutrients,
  );
  return {
    id: item.id ?? newId("item"),
    mealId,
    ownerKey,
    name: item.name.trim(),
    quantity: finiteNumber(item.quantity, 1),
    unit: item.unit?.trim() || "serving",
    calories: Math.max(0, finiteNumber(item.calories)),
    proteinG: Math.max(0, finiteNumber(item.proteinG)),
    carbsG: Math.max(0, finiteNumber(item.carbsG)),
    fatG: Math.max(0, finiteNumber(item.fatG)),
    ...nutrients,
    nutrientProvenanceJson:
      Object.keys(provenance).length > 0 ? JSON.stringify(provenance) : null,
    confidence: item.confidence == null ? null : finiteNumber(item.confidence),
    source: item.source?.trim() || "manual",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** The calories and macros that the items of an entry add up to. */
export function totalsOf(
  items: readonly Pick<
    MealItemRow,
    "calories" | "proteinG" | "carbsG" | "fatG"
  >[],
) {
  return items.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      proteinG: sum.proteinG + item.proteinG,
      carbsG: sum.carbsG + item.carbsG,
      fatG: sum.fatG + item.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

/** The rows of the items of an entry, and the totals that they add up to. */
export function buildItemRows({
  items,
  ownerKey,
  mealId,
  timestamp,
}: {
  items: EntryItemInput[];
  ownerKey: string;
  mealId: string;
  timestamp: number;
}): { rows: NewMealItem[]; totals: ReturnType<typeof totalsOf> } {
  const rows = items.map((item) =>
    buildItemRow({ item, ownerKey, mealId, timestamp }),
  );
  return { rows, totals: totalsOf(rows) };
}

/** The rows of a new entry. The caller gives the ID, or it is made here. */
export function buildEntryRows({
  ownerKey,
  input,
  timestamp,
}: {
  ownerKey: string;
  input: EntryInput;
  timestamp: number;
}): { meal: NewMealLog; items: NewMealItem[] } {
  const mealId = input.id ?? newId("meal");
  const { rows, totals } = buildItemRows({
    items: input.items ?? [],
    ownerKey,
    mealId,
    timestamp,
  });
  return {
    meal: {
      id: mealId,
      ownerKey,
      consumedAt: input.consumedAt ?? timestamp,
      source: input.source?.trim() || "dashboard",
      caption: input.caption?.trim() || "",
      mealType: input.mealType ?? null,
      status: input.status?.trim() || "complete",
      photoKey: input.photoKey ?? null,
      photoMimeType: input.photoMimeType ?? null,
      photoSizeBytes: input.photoSizeBytes ?? null,
      totalCalories: totals.calories,
      totalProteinG: totals.proteinG,
      totalCarbsG: totals.carbsG,
      totalFatG: totals.fatG,
      confidence: input.confidence ?? null,
      assumptionsJson: JSON.stringify(input.assumptions ?? []),
      notes: input.notes ?? null,
      externalRequestId: null,
      savedEntryId: input.savedEntryId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    items: rows,
  };
}

/** What a saved entry keeps of an entry. A later edit of the entry does not change it. */
export interface EntrySnapshot {
  caption: string;
  mealType: string | null;
  confidence: number | null;
  assumptions: unknown[];
  notes: string | null;
  items: EntryItemInput[];
}

export function snapshotOf({ meal, items }: MealWithItems): EntrySnapshot {
  const assumptions = parseJson(meal.assumptionsJson, []);
  return {
    caption: meal.caption,
    mealType: meal.mealType,
    confidence: meal.confidence,
    assumptions: Array.isArray(assumptions) ? assumptions : [],
    notes: meal.notes,
    items: items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      ...itemNutrients(item),
      nutrientProvenance: storedProvenance(item),
      confidence: item.confidence,
      source: item.source,
    })),
  };
}

/** The snapshot of a saved entry, or `null` when the stored text is damaged. */
export function readSnapshot(row: SavedEntryRow): EntrySnapshot | null {
  const value = parseJson(row.snapshotJson, null) as EntrySnapshot | null;
  return value && typeof value === "object" && Array.isArray(value.items)
    ? value
    : null;
}

function withoutOwnerKey<Row extends { ownerKey: string }>(row: Row) {
  const { ownerKey, ...rest } = row;
  void ownerKey;
  return rest;
}

/** An entry as the API sends it: no owner key, and parsed JSON columns. */
export function serialiseEntry({ meal, items }: MealWithItems) {
  const { assumptionsJson, ...mealRest } = withoutOwnerKey(meal);
  return {
    ...mealRest,
    assumptions: parseJson(assumptionsJson, []) as unknown[],
    items: items.map((item) => {
      const { nutrientProvenanceJson, ...itemRest } = withoutOwnerKey(item);
      void nutrientProvenanceJson;
      const nutrientProvenance = storedProvenance(item);
      return Object.keys(nutrientProvenance).length > 0
        ? { ...itemRest, nutrientProvenance }
        : itemRest;
    }),
  };
}

/** A saved entry as the API sends it, with the totals worked out from its items. */
export function serialiseSavedEntry(
  row: SavedEntryRow,
  snapshot: EntrySnapshot,
) {
  const totals = snapshot.items.reduce(
    (sum, item) => ({
      calories: sum.calories + Math.max(0, finiteNumber(item.calories)),
      proteinG: sum.proteinG + Math.max(0, finiteNumber(item.proteinG)),
      carbsG: sum.carbsG + Math.max(0, finiteNumber(item.carbsG)),
      fatG: sum.fatG + Math.max(0, finiteNumber(item.fatG)),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  return {
    id: row.id,
    sourceEntryId: row.sourceMealId,
    caption: snapshot.caption,
    entryType: snapshot.mealType,
    totalCalories: totals.calories,
    totalProteinG: totals.proteinG,
    totalCarbsG: totals.carbsG,
    totalFatG: totals.fatG,
    items: snapshot.items,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
