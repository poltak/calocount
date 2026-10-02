import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublicSummaryResponse,
  parsePublicSummaryView,
  PublicSummaryConfigError,
} from "../app/api/_lib/public-summary";
import type { getDailyHistory, getDashboardSummary } from "../db/repository";
import { resolveNutrientGoals } from "../domain/nutrient-goals";
import { aggregateNutrients, emptyNutrientValues } from "../domain/nutrients";

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
  assert.equal(parsePublicSummaryView("everything"), null);
  assert.equal(parsePublicSummaryView(""), null);
});
