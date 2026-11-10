import {
  entryKind,
  entryKindLabels,
  type EntryKind,
} from "@app/common/features/entries/utils/entry-kind";
import {
  NUTRIENT_KEYS,
  NUTRIENT_UPPER_LIMIT_KEYS,
  type NutrientKey,
  type NutrientUpperLimitKey,
} from "@app/common/features/entries/utils/nutrients";
import type {
  NutrientProvenanceMap,
  NutrientValueOrigin,
} from "@app/common/features/entries/utils/nutrient-provenance";
import type { SerializedEntry } from "./api-types.js";
import { clockTime } from "../../core/utils/dashboard-format.js";

export const TRACKED_NUTRIENT_KEYS = [
  ...NUTRIENT_KEYS,
  ...NUTRIENT_UPPER_LIMIT_KEYS,
] as const;

type NutrientAmounts = Partial<
  Record<NutrientKey | NutrientUpperLimitKey, number | null>
>;

/** One food or drink of an entry. */
export interface ItemView {
  id: string | undefined;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: number | null;
  source: string;
  nutrients: NutrientAmounts;
  nutrientProvenance: NutrientProvenanceMap;
}

/** An entry as the dashboard lists it. */
export interface EntryView {
  id: string;
  consumedAt: number;
  time: string;
  name: string;
  description: string;
  kind: EntryKind | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  savedEntryId: string | null;
  /** The key of the photo in the bucket, or `null`. */
  photoKey: string | null;
  items: ItemView[];
}

/** The JSON of the API marks a missing origin as optional, and the view leaves it out. */
function provenanceOf(
  sent: Partial<Record<NutrientKey, NutrientValueOrigin | undefined>>,
): NutrientProvenanceMap {
  const provenance: NutrientProvenanceMap = {};
  for (const key of NUTRIENT_KEYS) {
    const origin = sent[key];
    if (origin) {
      provenance[key] = origin;
    }
  }
  return provenance;
}

function itemViewOf(item: SerializedEntry["items"][number]): ItemView {
  const nutrients: NutrientAmounts = {};
  for (const key of TRACKED_NUTRIENT_KEYS) {
    nutrients[key] = item[key];
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
    nutrients,
    nutrientProvenance: provenanceOf(
      "nutrientProvenance" in item ? item.nutrientProvenance : {},
    ),
  };
}

export function entryViewOf({
  entry,
  timeZone,
}: {
  entry: SerializedEntry;
  timeZone: string;
}): EntryView {
  const kind = entryKind(entry.mealType);
  const itemNames = entry.items.map((item) => item.name).filter(Boolean);
  return {
    id: entry.id,
    consumedAt: entry.consumedAt,
    time: clockTime(entry.consumedAt, timeZone),
    name:
      itemNames[0] ||
      entry.caption.split(",")[0]?.trim() ||
      (kind ? `${entryKindLabels[kind]} entry` : "Entry"),
    description:
      entry.caption || itemNames.join(", ") || "Logged from dashboard",
    kind,
    calories: entry.totalCalories,
    protein: entry.totalProteinG,
    carbs: entry.totalCarbsG,
    fat: entry.totalFatG,
    savedEntryId: entry.savedEntryId,
    photoKey: entry.photoKey,
    items: entry.items.map(itemViewOf),
  };
}

/** The totals of the entries of a day. */
export function dayTotals(entries: readonly EntryView[]) {
  return {
    calories: entries.reduce((sum, entry) => sum + entry.calories, 0),
    protein: entries.reduce((sum, entry) => sum + entry.protein, 0),
    carbs: entries.reduce((sum, entry) => sum + entry.carbs, 0),
    fat: entries.reduce((sum, entry) => sum + entry.fat, 0),
  };
}
