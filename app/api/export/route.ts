import { getSettings, listAiRuns, listMeals } from "../../../db/repository";
import {
  getRequestDb,
  jsonResponse,
  requireApiIdentity,
  withApiErrors,
} from "../_lib/http";
import { serialiseMeals, withoutOwnerKey } from "../_lib/serialise";

async function allMeals(db: ReturnType<typeof import("../../../db").getDb>, ownerKey: string) {
  const result = [];
  for (let offset = 0; offset < 10_000; offset += 500) {
    const page = await listMeals(db, ownerKey, { limit: 500, offset });
    result.push(...page);
    if (page.length < 500) break;
  }
  return result;
}

function csvCell(value: unknown): string {
  const raw = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function csvExport(meals: ReturnType<typeof serialiseMeals>): string {
  const rows: unknown[][] = [
    ["meal_id", "consumed_at", "meal_type", "caption", "status", "calories", "protein_g", "carbs_g", "fat_g", "item_name", "quantity", "unit", "item_calories", "item_protein_g", "item_carbs_g", "item_fat_g"],
  ];
  for (const meal of meals) {
    if (meal.items.length === 0) {
      rows.push([meal.id, new Date(meal.consumedAt).toISOString(), meal.mealType, meal.caption, meal.status, meal.totalCalories, meal.totalProteinG, meal.totalCarbsG, meal.totalFatG, "", "", "", "", "", "", ""]);
      continue;
    }
    for (const item of meal.items) {
      rows.push([meal.id, new Date(meal.consumedAt).toISOString(), meal.mealType, meal.caption, meal.status, meal.totalCalories, meal.totalProteinG, meal.totalCarbsG, meal.totalFatG, item.name, item.quantity, item.unit, item.calories, item.proteinG, item.carbsG, item.fatG]);
    }
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = requireApiIdentity(request);
    const db = getRequestDb();
    const [mealRows, settings, runs] = await Promise.all([
      allMeals(db, identity.ownerKey),
      getSettings(db, identity.ownerKey),
      listAiRuns(db, identity.ownerKey, { limit: 500 }),
    ]);
    const meals = serialiseMeals(mealRows);
    const format = new URL(request.url).searchParams.get("format")?.toLowerCase() ?? "json";
    if (format === "csv") {
      return new Response(csvExport(meals), {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="calocount-export.csv"`,
        },
      });
    }
    if (format !== "json") {
      return jsonResponse({ error: { code: "invalid_format", message: "format must be json or csv." } }, { status: 400 });
    }
    const publicSettings = settings ? withoutOwnerKey(settings) : null;
    return jsonResponse({
      exportedAt: new Date().toISOString(),
      settings: publicSettings,
      meals,
      aiRuns: runs.map(withoutOwnerKey),
    });
  });
}
