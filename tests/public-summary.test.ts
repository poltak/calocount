import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublicSummaryResponse,
  parsePublicSummaryView,
  PublicSummaryConfigError,
} from "../app/api/_lib/public-summary";
import { getDayLog, getMonthTotals, type getDailyHistory, type getDashboardSummary } from "../db/repository";
import { resolveNutrientGoals } from "../domain/nutrient-goals";
import { aggregateNutrients, emptyNutrientValues } from "../domain/nutrients";
import { createSqliteTestDb } from "./helpers/sqlite-db";

type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;
type DailyHistory = Awaited<ReturnType<typeof getDailyHistory>>;

async function mustNotLoad(): Promise<never> {
  throw new Error("must not load this view");
}

test("public summary fails closed when the owner key is missing", async () => {
  await assert.rejects(
    buildPublicSummaryResponse({
      ownerKey: "  ",
      loadSummary: mustNotLoad,
      loadDailyHistory: mustNotLoad,
      loadMonth: mustNotLoad,
      loadDay: mustNotLoad,
    }),
    (error: unknown) => error instanceof PublicSummaryConfigError
      && error.status === 503
      && error.code === "public_owner_key_missing",
  );
});

test("public summary returns a no-store projection without private fields", async () => {
  const requestedOwnerKeys: string[] = [];
  const date = "2026-08-25";
  const itemNutrients = { ...emptyNutrientValues(), sodiumMg: 840 };
  const nutrientAggregates = aggregateNutrients([itemNutrients]);
  const summary = {
    date,
    timezone: "UTC",
    referenceSettings: { vitaminB6UsFnbAdultUlEnabled: true, usFnbAdultUlEnabled: true },
    targets: {
      calories: 2_100,
      proteinG: 150,
      nutrients: resolveNutrientGoals(),
    },
    proteinGoal: {
      mode: "grams",
      gramsPerKg: null,
      fixedTargetG: 150,
      targetG: 150,
      weightKg: null,
      weightDate: null,
      byDate: [],
    },
    today: { calories: 2_337, proteinG: 120, carbsG: 220, fatG: 80, mealCount: 1 },
    sevenDay: {
      calories: 2_337,
      proteinG: 120,
      averageCalories: 2_337,
      averageProteinG: 120,
      daysWithMeals: 1,
    },
    nutrition: {
      today: nutrientAggregates,
      sevenDay: nutrientAggregates,
      byDate: [{ date, nutrients: nutrientAggregates }],
    },
    trend: {
      byDate: [{
        date,
        calories: 2_337,
        proteinG: 120,
        carbsG: 220,
        fatG: 80,
        mealCount: 1,
        nutrients: nutrientAggregates,
      }],
      weights: [{ logicalDate: date, weightKg: 74.5, recordedAt: Date.parse("2026-08-25T07:30:00Z") }],
    },
    insights: { fromDate: "2026-07-26", toDate: date, entries: [] },
    recentMeals: [{
      meal: {
        id: "meal-1",
        ownerKey: "owner-secret",
        consumedAt: Date.parse("2026-08-25T12:00:00Z"),
        source: "chatgpt",
        caption: "private caption",
        mealType: "lunch",
        status: "complete",
        photoKey: "private/photo-key",
        photoMimeType: "image/jpeg",
        photoSizeBytes: 123,
        totalCalories: 2_337,
        totalProteinG: 120,
        totalCarbsG: 220,
        totalFatG: 80,
        confidence: 0.9,
        assumptionsJson: "private assumptions",
        notes: "private notes",
        externalRequestId: null,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [{
        id: "item-1",
        mealId: "meal-1",
        ownerKey: "owner-secret",
        name: "Rice bowl",
        quantity: 1,
        unit: "serving",
        calories: 2_337,
        proteinG: 120,
        carbsG: 220,
        fatG: 80,
        ...itemNutrients,
        preformedVitaminAMcgRae: 3_500,
        supplementalMagnesiumMg: 400,
        folicAcidMcg: 1_100,
        supplementalVitaminEMg: 900,
        nutrientProvenanceJson: JSON.stringify({ vitaminAMcgRae: "label" }),
        confidence: 0.9,
        source: "ai",
        createdAt: 1,
        updatedAt: 1,
      }],
    }],
    recentWeights: [{
      id: "weight-1",
      ownerKey: "owner-secret",
      logicalDate: date,
      weightKg: 74.5,
      recordedAt: Date.parse("2026-08-25T07:30:00Z"),
      createdAt: 1,
      updatedAt: 2,
    }],
  } satisfies DashboardSummary;
  const response = await buildPublicSummaryResponse({
    ownerKey: " owner-1 ",
    loadSummary: async (ownerKey) => {
      requestedOwnerKeys.push(ownerKey);
      return summary;
    },
    loadDailyHistory: mustNotLoad,
    loadMonth: mustNotLoad,
    loadDay: mustNotLoad,
  });

  assert.deepEqual(requestedOwnerKeys, ["owner-1"]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as Record<string, unknown>;
  const serialised = JSON.stringify(body);
  for (const field of [
    "ownerKey", "caption", "notes", "photoKey", "photoMimeType", "assumptions",
    "confidence", "source", "provider", "chatgpt", "export", "rawUsage", "referenceSettings", "vitaminB6UsFnbAdultUl",
    "preformedVitaminAMcgRae", "supplementalMagnesiumMg", "folicAcidMcg", "supplementalVitaminEMg", "nutrientProvenance",
  ]) assert.doesNotMatch(serialised, new RegExp(field, "i"));
  assert.equal((body.targets as Record<string, unknown>).calories, 2_100);
  assert.equal(((body.sevenDay as Record<string, unknown>).trend as Array<Record<string, unknown>>).at(-1)?.calories, 2_337);
  assert.equal(
    (((body.nutrition as Record<string, Record<string, Record<string, unknown>>>).today).sodiumMg).amount,
    840,
  );
  assert.equal(((body.recentMeals as Array<Record<string, unknown>>)[0]).hasPhoto, true);
});

test("the daily view returns small rounded day rows and nothing else from the history", async () => {
  const requestedOwnerKeys: string[] = [];
  const history = {
    date: "2026-08-25",
    timezone: "Asia/Ho_Chi_Minh",
    firstEntryDate: "2026-08-24",
    firstWeightDate: "2026-08-25",
    fromDate: "2026-08-24",
    toDate: "2026-08-25",
    targets: { calories: 2_100, proteinG: 132.6 },
    goalChanges: [{
      date: "2026-08-24",
      changedAt: Date.parse("2026-08-23T18:00:00Z"),
      dailyCalorieTarget: 2_100,
      proteinGoalMode: "gramsPerKg",
      dailyProteinTargetG: null,
      dailyProteinTargetPerKg: 2,
    }],
    days: [
      { date: "2026-08-24", calories: 2_386.6769999999997, proteinG: 0.1 + 0.2, carbsG: 220, fatG: 80, mealCount: 4, weightKg: null },
      { date: "2026-08-25", calories: 0, proteinG: 0, carbsG: 0, fatG: 0, mealCount: 0, weightKg: 66.3 },
    ],
  } satisfies DailyHistory;
  const response = await buildPublicSummaryResponse({
    ownerKey: " owner-1 ",
    view: "daily",
    loadSummary: mustNotLoad,
    loadDailyHistory: async (ownerKey) => {
      requestedOwnerKeys.push(ownerKey);
      // A field added to the repository result must not reach the public response by default.
      return { ...history, ownerKey, notes: "private notes" };
    },
    loadMonth: mustNotLoad,
    loadDay: mustNotLoad,
  });

  assert.deepEqual(requestedOwnerKeys, ["owner-1"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    view: "daily",
    date: "2026-08-25",
    timezone: "Asia/Ho_Chi_Minh",
    units: { calories: "kcal", proteinG: "g", carbsG: "g", fatG: "g", weightKg: "kg" },
    firstEntryDate: "2026-08-24",
    firstWeightDate: "2026-08-25",
    fromDate: "2026-08-24",
    toDate: "2026-08-25",
    targets: { calories: 2_100, proteinG: 132.6 },
    goalChanges: [{
      date: "2026-08-24",
      changedAt: Date.parse("2026-08-23T18:00:00Z"),
      calories: 2_100,
      proteinMode: "gramsPerKg",
      proteinG: null,
      proteinGramsPerKg: 2,
    }],
    days: [
      { date: "2026-08-24", calories: 2_386.677, proteinG: 0.3, carbsG: 220, fatG: 80, mealCount: 4, weightKg: null },
      { date: "2026-08-25", calories: 0, proteinG: 0, carbsG: 0, fatG: 0, mealCount: 0, weightKg: 66.3 },
    ],
  });
});

test("the view query selects the dashboard by default and rejects an unknown view", () => {
  assert.equal(parsePublicSummaryView(null), "dashboard");
  assert.equal(parsePublicSummaryView("dashboard"), "dashboard");
  assert.equal(parsePublicSummaryView("daily"), "daily");
  assert.equal(parsePublicSummaryView("month"), "month");
  assert.equal(parsePublicSummaryView("day"), "day");
  assert.equal(parsePublicSummaryView("everything"), null);
  assert.equal(parsePublicSummaryView(""), null);
});

/** A database with a saved timezone, entries on 20 August 2026 in that timezone, and one entry of today. */
function publicHistoryFixture() {
  const fixture = createSqliteTestDb();
  fixture.sqlite.prepare("INSERT INTO settings (id, owner_key, timezone, daily_protein_target_g) VALUES ('settings', 'owner-1', 'Asia/Ho_Chi_Minh', 140)").run();
  const insertMeal = fixture.sqlite.prepare(`
    INSERT INTO meal_logs (id, owner_key, consumed_at, status, caption, notes, meal_type, photo_key, photo_mime_type, total_calories, total_protein_g, total_carbs_g, total_fat_g)
    VALUES (?, ?, ?, ?, 'Private caption', 'Private notes', 'dinner', ?, 'image/jpeg', ?, ?, 60, 20)
  `);
  const insertItem = fixture.sqlite.prepare("INSERT INTO meal_items (id, meal_id, owner_key, name, calories, protein_g, fiber_g) VALUES (?, ?, ?, ?, ?, ?, 4)");
  const add = (id: string, eatenAt: string, calories: number, proteinG: number, { ownerKey = "owner-1", status = "complete" } = {}) => {
    insertMeal.run(id, ownerKey, Date.parse(eatenAt), status, `meals/${ownerKey}/${id}`, calories, proteinG);
    insertItem.run(`item-${id}`, id, ownerKey, `Item of ${id}`, calories, proteinG);
  };
  // 00:30 on 20 August in Ho Chi Minh City is 17:30 on 19 August in UTC.
  add("breakfast", "2026-08-19T17:30:00Z", 400.0004, 20);
  add("dinner", "2026-08-20T12:00:00Z", 700, 45.1234567);
  add("pending", "2026-08-20T13:00:00Z", 50, 5, { status: "pending" });
  add("foreign", "2026-08-20T06:00:00Z", 999, 99, { ownerKey: "owner-2" });
  add("today", "2026-09-12T05:00:00Z", 500, 30);
  fixture.sqlite.prepare("INSERT INTO daily_weights (id, owner_key, logical_date, weight_kg, recorded_at) VALUES ('weight', 'owner-1', '2026-08-20', 71.2, 5)").run();
  return fixture;
}

test("the public month view gives the totals of each day in the owner's saved timezone", async () => {
  const fixture = publicHistoryFixture();
  try {
    const response = await buildPublicSummaryResponse({
      ownerKey: "owner-1",
      view: "month",
      loadSummary: mustNotLoad,
      loadDailyHistory: mustNotLoad,
      loadMonth: (ownerKey) => getMonthTotals({ db: fixture.db, ownerKey, month: "2026-08", useSavedTimezone: true }),
      loadDay: mustNotLoad,
    });

    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      view: "month",
      month: "2026-08",
      timezone: "Asia/Ho_Chi_Minh",
      firstDate: "2026-08-20",
      days: [{ date: "2026-08-20", calories: 1_100, proteinG: 65.123, mealCount: 2 }],
    });
  } finally {
    fixture.sqlite.close();
  }
});

test("the public day view lists completed entries without private fields or old photos", async () => {
  const fixture = publicHistoryFixture();
  try {
    const now = new Date("2026-09-12T12:00:00Z");
    const dayView = async (date: string) => {
      const response = await buildPublicSummaryResponse({
        ownerKey: "owner-1",
        view: "day",
        now,
        loadSummary: mustNotLoad,
        loadDailyHistory: mustNotLoad,
        loadMonth: mustNotLoad,
        loadDay: (ownerKey) => getDayLog({ db: fixture.db, ownerKey, date, useSavedTimezone: true }),
      });
      assert.equal(response.headers.get("cache-control"), "no-store");
      const text = await response.text();
      return { text, body: JSON.parse(text) };
    };

    const older = await dayView("2026-08-20");
    assert.deepEqual(Object.keys(older.body), ["view", "date", "timezone", "meals", "weight", "proteinGoal"]);
    assert.equal(older.body.date, "2026-08-20");
    assert.equal(older.body.timezone, "Asia/Ho_Chi_Minh");
    // Newest first. The pending entry and the entry of another owner are left out.
    assert.deepEqual(older.body.meals.map((meal: { id: string }) => meal.id), ["dinner", "breakfast"]);
    assert.deepEqual(Object.keys(older.body.meals[0]), ["id", "consumedAt", "mealType", "hasPhoto", "totalCalories", "totalProteinG", "totalCarbsG", "totalFatG", "items"]);
    assert.equal(older.body.meals[0].totalProteinG, 45.123);
    assert.equal(older.body.meals[1].totalCalories, 400);
    assert.deepEqual(Object.keys(older.body.meals[0].items[0]), ["name", "quantity", "unit", "calories", "proteinG", "carbsG", "fatG", "nutrients"]);
    assert.equal(older.body.meals[0].items[0].name, "Item of dinner");
    assert.equal(older.body.meals[0].items[0].nutrients.fiberG, 4);
    // The photo route serves the last seven days only, so an older entry reports no photo.
    assert.deepEqual(older.body.meals.map((meal: { hasPhoto: boolean }) => meal.hasPhoto), [false, false]);
    assert.deepEqual(older.body.weight, { logicalDate: "2026-08-20", weightKg: 71.2, recordedAt: 5 });
    assert.deepEqual(older.body.proteinGoal, { date: "2026-08-20", targetG: 140, weightKg: null, weightDate: null });
    assert.doesNotMatch(older.text, /owner-1|Private|photoKey|meals\/|image\/jpeg/);

    const today = await dayView("2026-09-12");
    assert.deepEqual(today.body.meals.map((meal: { id: string; hasPhoto: boolean }) => [meal.id, meal.hasPhoto]), [["today", true]]);
    assert.equal(today.body.weight, null);
  } finally {
    fixture.sqlite.close();
  }
});
