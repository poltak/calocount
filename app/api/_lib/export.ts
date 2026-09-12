import type { getExportData } from "../../../db/repository";
import { NUTRIENT_KEYS } from "../../../domain/nutrients";
import { serialiseMeal, withoutOwnerKey } from "./serialise";

type ExportData = Awaited<ReturnType<typeof getExportData>>;
const encoder = new TextEncoder();

function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function* csvChunks(data: ExportData): Generator<string> {
  yield ["meal_id", "consumed_at", "meal_type", "caption", "status", "calories", "protein_g", "carbs_g", "fat_g", "item_name", "quantity", "unit", "item_calories", "item_protein_g", "item_carbs_g", "item_fat_g", ...NUTRIENT_KEYS].map(csvCell).join(",") + "\n";
  for (const entry of data.meals) {
    const meal = entry.meal;
    const base = [meal.id, new Date(meal.consumedAt).toISOString(), meal.mealType, meal.caption, meal.status, meal.totalCalories, meal.totalProteinG, meal.totalCarbsG, meal.totalFatG];
    if (entry.items.length === 0) {
      yield [...base, ...Array(7 + NUTRIENT_KEYS.length).fill("")].map(csvCell).join(",") + "\n";
    }
    for (const item of entry.items) {
      yield [...base, item.name, item.quantity, item.unit, item.calories, item.proteinG, item.carbsG, item.fatG, ...NUTRIENT_KEYS.map((key) => item[key])].map(csvCell).join(",") + "\n";
    }
  }
}

function* jsonChunks(data: ExportData): Generator<string> {
  yield JSON.stringify({
    exportedAt: new Date().toISOString(),
    settings: data.settings ? withoutOwnerKey(data.settings) : null,
    weights: data.weights.map(withoutOwnerKey),
    aiRuns: data.aiRuns.map(withoutOwnerKey),
  }).slice(0, -1) + ',"meals":[';
  for (let index = 0; index < data.meals.length; index++) {
    if (index > 0) yield ",";
    yield JSON.stringify(serialiseMeal(data.meals[index]));
  }
  yield "]}\n";
}

export async function buildExportResponse({ format, loadData }: {
  format: string;
  loadData: () => Promise<ExportData>;
}): Promise<Response> {
  if (format !== "json" && format !== "csv") {
    return Response.json({ error: { code: "invalid_format", message: "format must be json or csv." } }, {
      status: 400, headers: { "cache-control": "no-store" },
    });
  }
  const data = await loadData();
  const chunks = format === "csv" ? csvChunks(data) : jsonChunks(data);
  return new Response(new ReadableStream({
    pull(controller) {
      const next = chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(next.value));
    },
    cancel() { chunks.return(undefined); },
  }), {
    headers: {
      "cache-control": "no-store",
      "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="calocount-export.${format}"`,
    },
  });
}
