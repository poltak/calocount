import {
  entryKind,
  type EntryKind,
} from "@app/common/features/entries/utils/entry-kind";
import {
  NUTRIENT_KEYS,
  type NutrientKey,
} from "@app/common/features/entries/utils/nutrients";
import {
  isNutrientValueOrigin,
  type NutrientProvenanceMap,
} from "@app/common/features/entries/utils/nutrient-provenance";
import { applyTotalChanges } from "./item-totals.js";
import { parseNutrientText } from "./nutrient-format.js";
import {
  TRACKED_NUTRIENT_KEYS,
  type EntryView,
  type ItemView,
} from "./entry-view.js";

/** The text of each nutrient field, by nutrient. A missing field is blank. */
export type NutrientTexts = Partial<Record<NutrientKey, string>>;

/** The fields of the form for a new entry, as the owner typed them. */
export interface NewEntryValues {
  time: string;
  kind: string;
  name: string;
  description: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  nutrients: NutrientTexts;
  /** The origin that the owner chose for each nutrient. An empty text is no origin. */
  origins: NutrientTexts;
}

export type TotalField = "calories" | "protein" | "carbs" | "fat";

/** The edit of one entry, held as text so that the owner can empty a field and type again. */
export interface EditDraft {
  original: EntryView;
  name: string;
  description: string;
  kind: EntryKind | null;
  totals: Record<TotalField, string>;
  items: { nutrients: NutrientTexts; origins: NutrientTexts }[];
}

function textOf(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Read the fields of the form for a new entry. */
export function readEntryForm(form: HTMLFormElement): NewEntryValues {
  const data = new FormData(form);
  const nutrients: NutrientTexts = {};
  const origins: NutrientTexts = {};
  for (const key of NUTRIENT_KEYS) {
    nutrients[key] = textOf(data, `nutrient-${key}`);
    origins[key] = textOf(data, `nutrient-origin-${key}`);
  }
  return {
    time: textOf(data, "time"),
    kind: textOf(data, "mealType"),
    name: textOf(data, "name"),
    description: textOf(data, "description"),
    calories: textOf(data, "calories"),
    protein: textOf(data, "protein"),
    carbs: textOf(data, "carbs"),
    fat: textOf(data, "fat"),
    nutrients,
    origins,
  };
}

/** A total that the owner typed. An empty or damaged field counts as zero. */
function totalOf(text: string): number {
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The nutrient fields as the API takes them, and the origin of each known value. */
function nutrientBody({
  nutrients,
  origins,
}: {
  nutrients: NutrientTexts;
  origins: NutrientTexts;
}) {
  const values: Partial<Record<NutrientKey, number | null>> = {};
  const nutrientProvenance: NutrientProvenanceMap = {};
  for (const key of NUTRIENT_KEYS) {
    const value = parseNutrientText(nutrients[key] ?? "");
    values[key] = value;
    const origin = origins[key];
    if (value !== null && isNutrientValueOrigin(origin)) {
      nutrientProvenance[key] = origin;
    }
  }
  return { values, nutrientProvenance };
}

/** The body for a new entry on one day. The entry has one item, which carries the nutrients. */
export function newEntryBody({
  values,
  consumedAt,
}: {
  values: NewEntryValues;
  consumedAt: number;
}) {
  const name = values.name.trim() || "New entry";
  const { values: nutrients, nutrientProvenance } = nutrientBody(values);
  return {
    consumedAt,
    source: "dashboard",
    caption: values.description.trim() || "Added from dashboard",
    mealType: entryKind(values.kind),
    status: "complete" as const,
    items: [
      {
        name,
        quantity: 1,
        unit: "serving",
        calories: totalOf(values.calories),
        proteinG: totalOf(values.protein),
        carbsG: totalOf(values.carbs),
        fatG: totalOf(values.fat),
        ...nutrients,
        nutrientProvenance,
        source: "dashboard",
      },
    ],
  };
}

function texts(item: ItemView): {
  nutrients: NutrientTexts;
  origins: NutrientTexts;
} {
  const nutrients: NutrientTexts = {};
  const origins: NutrientTexts = {};
  for (const key of NUTRIENT_KEYS) {
    const value = item.nutrients[key];
    nutrients[key] = value === null || value === undefined ? "" : String(value);
    origins[key] = item.nutrientProvenance[key] ?? "";
  }
  return { nutrients, origins };
}

export function startDraft(entry: EntryView): EditDraft {
  return {
    original: entry,
    name: entry.name,
    description: entry.description,
    kind: entry.kind,
    totals: {
      calories: String(entry.calories),
      protein: String(entry.protein),
      carbs: String(entry.carbs),
      fat: String(entry.fat),
    },
    items: entry.items.map(texts),
  };
}

/**
 * The body for an edit. It always carries the items. The caption and the type
 * go in only when they changed, so that the stored source and status survive.
 * A total that the owner changed goes into the first item, so that the totals
 * of the entry stay equal to the sum of its items.
 */
export function editBody(draft: EditDraft) {
  const { original } = draft;
  const changes: Parameters<typeof applyTotalChanges>[0]["changes"] = {};
  if (draft.name !== original.name) {
    changes.name = draft.name;
  }
  const fields = {
    calories: original.calories,
    protein: original.protein,
    carbs: original.carbs,
    fat: original.fat,
  };
  for (const field of Object.keys(fields) as TotalField[]) {
    const total = totalOf(draft.totals[field]);
    if (total !== fields[field]) {
      changes[field] = total;
    }
  }
  // An entry with no items still has a total, which one item then holds.
  const baseItems: ItemView[] =
    original.items.length > 0
      ? original.items
      : [
          {
            id: undefined,
            name: original.name,
            quantity: 1,
            unit: "serving",
            calories: original.calories,
            proteinG: original.protein,
            carbsG: original.carbs,
            fatG: original.fat,
            confidence: null,
            source: "dashboard",
            nutrients: {},
            nutrientProvenance: {},
          },
        ];
  const items = applyTotalChanges({ items: baseItems, changes });
  return {
    ...(draft.description !== original.description
      ? { caption: draft.description }
      : {}),
    ...(draft.kind !== original.kind ? { mealType: draft.kind } : {}),
    items: items.map((item, index) => {
      const itemTexts = draft.items[index];
      const edited = itemTexts ? nutrientBody(itemTexts) : null;
      // Amounts of one source or form have no field yet, so they stay as they were.
      const kept: Partial<
        Record<(typeof TRACKED_NUTRIENT_KEYS)[number], number | null>
      > = {};
      for (const key of TRACKED_NUTRIENT_KEYS) {
        kept[key] = item.nutrients[key] ?? null;
      }
      return {
        ...(item.id ? { id: item.id } : {}),
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
        ...kept,
        ...edited?.values,
        confidence: item.confidence,
        source: item.source,
        nutrientProvenance:
          edited?.nutrientProvenance ?? item.nutrientProvenance,
      };
    }),
  };
}
