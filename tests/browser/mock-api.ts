import type { Page, Request } from "@playwright/test";
import { buildProteinGoalSummary, type ProteinGoalMode } from "../../domain/protein-goals";
import { resolveNutrientGoals } from "../../domain/nutrient-goals";
import { aggregateNutrients, NUTRIENT_KEYS, NUTRIENT_UPPER_LIMIT_KEYS } from "../../domain/nutrients";

const dayMs = 86_400_000;
const date = "2026-09-12";
const initialMeal = {
  id: "meal-1", consumedAt: Date.parse(`${date}T12:00:00Z`), caption: "Audit lunch",
  mealType: "lunch", status: "complete", totalCalories: 500, totalProteinG: 30,
  totalCarbsG: 50, totalFatG: 20, photoKey: null as string | null, photoMimeType: null as string | null, hasPhoto: false,
  savedEntryId: null as string | null,
  items: [{ name: "Audit lunch", quantity: 1, unit: "serving", calories: 500, proteinG: 30, carbsG: 50, fatG: 20, fiberG: 4 as number | null, caffeineMg: null as number | null }],
};

type MockMeal = typeof initialMeal;
type SavedEntry = {
  id: string; sourceEntryId: string; caption: string; entryType: string | null;
  totalCalories: number; totalProteinG: number; totalCarbsG: number; totalFatG: number;
  items: MockMeal["items"];
};
export type RecordedRequest = {
  method: string;
  path: string;
  search: string;
  contentType: string;
  /** The JSON body, or the JSON `payload` field of a multipart body. */
  body: Record<string, unknown> | null;
  /** The file name of an uploaded photo, when the body is multipart. */
  photoName: string | null;
};

// A one-pixel PNG for photo routes.
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Read a JSON body, or the `payload` field and file name of a multipart meal form. */
function readBody(request: Request): Pick<RecordedRequest, "body" | "photoName"> {
  const contentType = request.headers()["content-type"] ?? "";
  const raw = request.postDataBuffer();
  if (!raw) return { body: null, photoName: null };
  if (contentType.startsWith("multipart/form-data")) {
    const text = raw.toString("latin1");
    const payload = text.match(/name="payload"\r\n\r\n([\s\S]*?)\r\n--/)?.[1];
    return {
      body: payload ? JSON.parse(payload) : null,
      photoName: text.match(/name="photo"; filename="([^"]*)"/)?.[1] ?? null,
    };
  }
  try {
    return { body: JSON.parse(raw.toString("utf8")), photoName: null };
  } catch {
    return { body: null, photoName: null };
  }
}

function withTotals<T extends { items: MockMeal["items"] }>(meal: T) {
  const totals = { totalCalories: 0, totalProteinG: 0, totalCarbsG: 0, totalFatG: 0 };
  for (const item of meal.items) {
    totals.totalCalories += item.calories;
    totals.totalProteinG += item.proteinG;
    totals.totalCarbsG += item.carbsG;
    totals.totalFatG += item.fatG;
  }
  return Object.assign(meal, totals);
}

export async function mockDashboardApi(page: Page) {
  const state = {
    date,
    meals: [structuredClone(initialMeal)],
    weights: [{ logicalDate: "2026-09-11", weightKg: 70, recordedAt: Date.parse(`${date}T12:00:00Z`) }],
    settings: { timezone: "UTC", dailyCalorieTarget: 2400, dailyProteinTargetG: 160, proteinGoalMode: "grams" as ProteinGoalMode, dailyProteinTargetPerKg: 1.6, nutrientTargets: null, vitaminB6UsFnbAdultUlEnabled: false, usFnbAdultUlEnabled: false },
    savedEntries: [] as SavedEntry[],
    /** Every request the page made to the API, in order. */
    requests: [] as RecordedRequest[],
    summaryReads: 0,
    writes: 0,
    invalidSummary: false,
    failSummary: false,
    failSavedEntries: false,
    failPhotos: false,
    holdSummary: null as Promise<void> | null,
    holdWrite: null as Promise<void> | null,
    failWrite: false,
  };
  /** Build the summary with days counted in the given timezone, as the server does. */
  function summary(timezone: string) {
    const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    const dayOf = (timestamp: number) => dayFormatter.format(new Date(timestamp));
    const byDate = Array.from({ length: 30 }, (_, index) => {
      const day = new Date(Date.parse(state.date) - (29 - index) * dayMs).toISOString().slice(0, 10);
      const meals = state.meals.filter((meal) => dayOf(meal.consumedAt) === day);
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
      timezone,
      referenceSettings: { vitaminB6UsFnbAdultUlEnabled: state.settings.vitaminB6UsFnbAdultUlEnabled, usFnbAdultUlEnabled: state.settings.usFnbAdultUlEnabled },
      targets: { calories: state.settings.dailyCalorieTarget, proteinG: proteinGoal.targetG, nutrients: resolveNutrientGoals() },
      proteinGoal, today: byDate[29], sevenDay: { calories: 500, proteinG: 30, averageCalories: 0, averageProteinG: 0, daysWithMeals: 1 },
      recentMeals: state.meals, recentWeights: state.weights,
      insights: {
        fromDate: new Date(Date.parse(state.date) - 30 * dayMs).toISOString().slice(0, 10),
        toDate: state.date,
        entries: state.meals.map((meal) => ({
          id: meal.id, date: dayOf(meal.consumedAt), consumedAt: meal.consumedAt,
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
  await page.route("**/meal-photos/**", async (route) => {
    if (state.failPhotos) await route.fulfill({ status: 404, json: {} });
    else await route.fulfill({ contentType: "image/png", body: PIXEL_PNG });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const { body: requestBody, photoName } = readBody(request);
    state.requests.push({
      method: request.method(),
      path: pathname,
      search: url.search,
      contentType: request.headers()["content-type"] ?? "",
      body: requestBody,
      photoName,
    });
    if (pathname.startsWith("/api/photos/")) {
      if (state.failPhotos) await route.fulfill({ status: 404, json: {} });
      else await route.fulfill({ contentType: "image/png", body: PIXEL_PNG });
      return;
    }
    if (pathname.endsWith("/summary")) {
      state.summaryReads++;
      if (state.failSummary) {
        await route.fulfill({ status: 500, json: { error: { code: "internal_error", message: "Test summary failed." } } });
        return;
      }
      // The public summary uses the owner's saved timezone; the owner summary uses the one the page asks for.
      const timezone = pathname === "/api/public/summary" ? state.settings.timezone : url.searchParams.get("timezone") ?? "UTC";
      const fullBody = state.invalidSummary ? { date, today: {}, sevenDay: {} } : summary(timezone);
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
    if (pathname === "/api/saved-entries") {
      if (state.failSavedEntries) {
        await route.abort();
      } else if (request.method() === "POST") {
        const source = state.meals.find((meal) => meal.id === requestBody?.sourceEntryId)!;
        const entry: SavedEntry = {
          id: `saved-${state.writes}`, sourceEntryId: source.id, caption: source.caption, entryType: source.mealType,
          totalCalories: source.totalCalories, totalProteinG: source.totalProteinG,
          totalCarbsG: source.totalCarbsG, totalFatG: source.totalFatG, items: structuredClone(source.items),
        };
        state.savedEntries.unshift(entry);
        await route.fulfill({ status: 201, json: { entry } });
      } else {
        await route.fulfill({ json: { entries: state.savedEntries } });
      }
    } else if (pathname.startsWith("/api/saved-entries/") && pathname.endsWith("/track")) {
      const saved = state.savedEntries.find((entry) => pathname === `/api/saved-entries/${entry.id}/track`)!;
      const meal = withTotals({
        ...structuredClone(initialMeal), id: `meal-${state.writes + 1}`, caption: saved.caption, mealType: saved.entryType ?? "snack",
        consumedAt: Number(requestBody?.consumedAt), savedEntryId: saved.id, items: structuredClone(saved.items),
      });
      state.meals.push(meal);
      await route.fulfill({ status: 201, json: { entry: meal } });
    } else if (pathname.startsWith("/api/saved-entries/")) {
      state.savedEntries = state.savedEntries.filter((entry) => pathname !== `/api/saved-entries/${entry.id}`);
      await route.fulfill({ json: { deleted: true } });
    } else if (pathname === "/api/settings") {
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
      const source = pathname.endsWith("/copy")
        ? state.meals.find((meal) => pathname === `/api/meals/${meal.id}/copy`)!
        : initialMeal;
      const meal = withTotals({ ...structuredClone(source), ...requestBody, id: `meal-${state.writes + 1}` } as MockMeal);
      if (photoName) Object.assign(meal, { photoKey: `meals/owner/dashboard/${meal.id}/photo`, photoMimeType: "image/png", hasPhoto: true });
      state.meals.push(meal);
      await route.fulfill({ json: { meal } });
    } else if (request.method() === "PATCH") {
      const meal = state.meals.find((m) => pathname.endsWith(m.id))!;
      withTotals(Object.assign(meal, requestBody));
      if (photoName) Object.assign(meal, { photoKey: `meals/owner/dashboard/${meal.id}/photo`, photoMimeType: "image/png", hasPhoto: true });
      await route.fulfill({ json: { meal } });
    } else {
      await route.fulfill({ status: 404, json: {} });
    }
  });
  return state;
}
