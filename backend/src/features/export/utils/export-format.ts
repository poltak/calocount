import {
  NUTRIENT_KEYS,
  NUTRIENT_UPPER_LIMIT_KEYS,
} from "@app/common/features/entries/utils/nutrients";

/** The fields of an entry that the CSV file has. The JSON file keeps all of them. */
interface ExportedEntry {
  id: string;
  consumedAt: number;
  mealType: string | null;
  caption: string;
  status: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  items: Array<
    {
      name: string;
      quantity: number;
      unit: string;
      calories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    } & Record<
      | (typeof NUTRIENT_KEYS)[number]
      | (typeof NUTRIENT_UPPER_LIMIT_KEYS)[number],
      number | null
    >
  >;
}

export interface ExportData {
  entries: ExportedEntry[];
  settings: unknown;
  weights: unknown[];
  goalChanges: unknown[];
}

const encoder = new TextEncoder();
const TRACKED_KEYS = [...NUTRIENT_KEYS, ...NUTRIENT_UPPER_LIMIT_KEYS];

/** A cell that starts like a formula gets a quote in front, so a spreadsheet does not run it. */
function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function csvLine(values: unknown[]): string {
  return `${values.map(csvCell).join(",")}\n`;
}

function* csvChunks({ entries }: ExportData): Generator<string> {
  yield csvLine([
    "meal_id",
    "consumed_at",
    "meal_type",
    "caption",
    "status",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "item_name",
    "quantity",
    "unit",
    "item_calories",
    "item_protein_g",
    "item_carbs_g",
    "item_fat_g",
    ...TRACKED_KEYS,
  ]);
  for (const entry of entries) {
    const base = [
      entry.id,
      new Date(entry.consumedAt).toISOString(),
      entry.mealType,
      entry.caption,
      entry.status,
      entry.totalCalories,
      entry.totalProteinG,
      entry.totalCarbsG,
      entry.totalFatG,
    ];
    if (entry.items.length === 0) {
      yield csvLine([...base, ...Array(7 + TRACKED_KEYS.length).fill("")]);
    }
    for (const item of entry.items) {
      yield csvLine([
        ...base,
        item.name,
        item.quantity,
        item.unit,
        item.calories,
        item.proteinG,
        item.carbsG,
        item.fatG,
        ...TRACKED_KEYS.map((key) => item[key]),
      ]);
    }
  }
}

function* jsonChunks(data: ExportData, exportedAt: Date): Generator<string> {
  yield `${JSON.stringify({
    exportedAt: exportedAt.toISOString(),
    settings: data.settings,
    weights: data.weights,
    goalChanges: data.goalChanges,
  }).slice(0, -1)},"meals":[`;
  for (const [index, entry] of data.entries.entries()) {
    if (index > 0) {
      yield ",";
    }
    yield JSON.stringify(entry);
  }
  yield "]}\n";
}

/** The file as a stream, so that a large log does not need one large string. */
export function exportStream({
  data,
  format,
  exportedAt,
}: {
  data: ExportData;
  format: "json" | "csv";
  exportedAt: Date;
}): ReadableStream<Uint8Array> {
  const chunks =
    format === "csv" ? csvChunks(data) : jsonChunks(data, exportedAt);
  return new ReadableStream({
    pull(controller) {
      const next = chunks.next();
      if (next.done) {
        controller.close();
      } else {
        controller.enqueue(encoder.encode(next.value));
      }
    },
    cancel() {
      chunks.return(undefined);
    },
  });
}
