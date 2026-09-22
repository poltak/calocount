import type { Page } from "@playwright/test";
import { buildProteinGoalSummary, type ProteinGoalMode } from "../../domain/protein-goals";
import { resolveNutrientGoals } from "../../domain/nutrient-goals";
import { aggregateNutrients, NUTRIENT_KEYS, NUTRIENT_UPPER_LIMIT_KEYS } from "../../domain/nutrients";

const dayMs = 86_400_000;
const date = "2026-09-12";
const initialMeal = {
  id: "meal-1", consumedAt: Date.parse(`${date}T12:00:00Z`), caption: "Audit lunch",
  mealType: "lunch", status: "complete", totalCalories: 500, totalProteinG: 30,
  totalCarbsG: 50, totalFatG: 20, photoKey: null, hasPhoto: false,
  items: [{ name: "Audit lunch", quantity: 1, unit: "serving", calories: 500, proteinG: 30, carbsG: 50, fatG: 20, fiberG: 4 as number | null, caffeineMg: null as number | null }],
};

export async function mockDashboardApi(page: Page) {
  const state = {
    date,
    meals: [structuredClone(initialMeal)],
    weights: [{ logicalDate: "2026-09-11", weightKg: 70, recordedAt: Date.parse(`${date}T12:00:00Z`) }],
    settings: { dailyCalorieTarget: 2400, dailyProteinTargetG: 160, proteinGoalMode: "grams" as ProteinGoalMode, dailyProteinTargetPerKg: 1.6, nutrientTargets: null, vitaminB6UsFnbAdultUlEnabled: false, usFnbAdultUlEnabled: false },
    summaryReads: 0,
    writes: 0,
    invalidSummary: false,
    holdSummary: null as Promise<void> | null,
    holdWrite: null as Promise<void> | null,
    failWrite: false,
  };
  function summary() {
    const byDate = Array.from({ length: 30 }, (_, index) => {
      const day = new Date(Date.parse(state.date) - (29 - index) * dayMs).toISOString().slice(0, 10);
      const meals = state.meals.filter((meal) => new Date(meal.consumedAt).toISOString().startsWith(day));
      return {
        date: day, calories: meals.reduce((n, m) => n + m.totalCalories, 0),
        proteinG: meals.reduce((n, m) => n + m.totalProteinG, 0),
        carbsG: meals.reduce((n, m) => n + m.totalCarbsG, 0),
        fatG: meals.reduce((n, m) => n + m.totalFatG, 0),
        mealCount: meals.length, nutrients: aggregateNutrients(meals.flatMap((m) => m.items)),
      };
    });
    const proteinGoal = buildProteinGoalSummary({
      dates: byDate.slice(-7).map((day) => day.date), mode: state.settings.proteinGoalMode,
      fixedTargetG: state.settings.dailyProteinTargetG, gramsPerKg: state.settings.dailyProteinTargetPerKg,
      weights: state.weights,
    });
    return {
      date: state.date,
      referenceSettings: { vitaminB6UsFnbAdultUlEnabled: state.settings.vitaminB6UsFnbAdultUlEnabled, usFnbAdultUlEnabled: state.settings.usFnbAdultUlEnabled },
      targets: { calories: state.settings.dailyCalorieTarget, proteinG: proteinGoal.targetG, nutrients: resolveNutrientGoals() },
      proteinGoal, today: byDate[29], sevenDay: { calories: 500, proteinG: 30, averageCalories: 0, averageProteinG: 0, daysWithMeals: 1 },
      recentMeals: state.meals, recentWeights: state.weights,
      insights: {
        fromDate: new Date(Date.parse(state.date) - 30 * dayMs).toISOString().slice(0, 10),
        toDate: state.date,
        entries: state.meals.map((meal) => ({
          id: meal.id, date: new Date(meal.consumedAt).toISOString().slice(0, 10), consumedAt: meal.consumedAt,
          calories: meal.totalCalories, proteinG: meal.totalProteinG,
          items: meal.items.map((item) => ({
            name: item.name, quantity: item.quantity, unit: item.unit, calories: item.calories, proteinG: item.proteinG,
            nutrients: Object.fromEntries([...NUTRIENT_KEYS, ...NUTRIENT_UPPER_LIMIT_KEYS].map((key) => [key, (item as Record<string, unknown>)[key] ?? null])),
            nutrientProvenance: (item as Record<string, unknown>).nutrientProvenance,
          })),
        })),
      },
      trend: { byDate, weights: state.weights },
      nutrition: { today: byDate[29].nutrients, sevenDay: byDate[29].nutrients, byDate: byDate.slice(-7) },
    };
  }
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/summary")) {
      state.summaryReads++;
      const fullBody = state.invalidSummary ? { date, today: {}, sevenDay: {} } : summary();
      const body = pathname === "/api/public/summary" && "referenceSettings" in fullBody
        ? Object.fromEntries(Object.entries(fullBody).filter(([key]) => key !== "referenceSettings"))
        : fullBody;
      if (state.holdSummary) await state.holdSummary;
      await route.fulfill({ json: body }).catch(() => {});
      return;
    }
    if (request.method() !== "GET") {
      state.writes++;
      if (state.holdWrite) await state.holdWrite;
      if (state.failWrite) {
        await route.fulfill({ status: 500, json: { error: { message: "Test save failed." } } });
        return;
      }
    }
    if (pathname === "/api/settings") {
      if (request.method() === "PATCH") Object.assign(state.settings, request.postDataJSON());
      await route.fulfill({ json: { settings: state.settings } });
    } else if (pathname === "/api/weights") {
      const body = request.postDataJSON();
      const weight = { ...body, recordedAt: Date.now() };
      state.weights = [...state.weights.filter((w) => w.logicalDate !== body.logicalDate), weight];
      await route.fulfill({ json: { weight } });
    } else if (request.method() === "DELETE") {
      state.meals = state.meals.filter((meal) => !pathname.endsWith(meal.id));
      await route.fulfill({ json: { deleted: true, photoDeleted: true } });
    } else if (request.method() === "POST") {
      const body = request.postDataJSON();
      const source = pathname.endsWith("/copy")
        ? state.meals.find((meal) => pathname === `/api/meals/${meal.id}/copy`)!
        : initialMeal;
      const meal = { ...structuredClone(source), ...body, id: `meal-${state.writes + 1}` };
      for (const [total, field] of [["totalCalories", "calories"], ["totalProteinG", "proteinG"], ["totalCarbsG", "carbsG"], ["totalFatG", "fatG"]] as const) {
        meal[total] = meal.items.reduce((n: number, item: typeof initialMeal.items[number]) => n + item[field], 0);
      }
      state.meals.push(meal);
      await route.fulfill({ json: { meal } });
    } else if (request.method() === "PATCH") {
      const body = request.postDataJSON();
      const meal = state.meals.find((m) => pathname.endsWith(m.id))!;
      Object.assign(meal, body);
      for (const [total, field] of [["totalCalories", "calories"], ["totalProteinG", "proteinG"], ["totalCarbsG", "carbsG"], ["totalFatG", "fatG"]] as const) {
        meal[total] = meal.items.reduce((n, item) => n + item[field], 0);
      }
      await route.fulfill({ json: { meal } });
    } else {
      await route.fulfill({ status: 404, json: {} });
    }
  });
  return state;
}
