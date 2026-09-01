import assert from "node:assert/strict";
import test from "node:test";

import { projectPublicDashboardSummary } from "../app/api/_lib/public-summary-projection";
import { resolveNutrientGoals } from "../domain/nutrient-goals";
import { NUTRIENT_KEYS } from "../domain/nutrients";

test("public summary projection keeps dashboard data and strips private fields", () => {
  const summary = {
    date: "2026-08-25",
    targets: { calories: 2_100, proteinG: 150, nutrients: resolveNutrientGoals({ vitaminCMg: 200 }) },
    today: { calories: 2_337, proteinG: 120, carbsG: 220, fatG: 80, mealCount: 1 },
    sevenDay: {
      calories: 12_000,
      proteinG: 800,
      averageCalories: 1_714,
      averageProteinG: 114,
      daysWithMeals: 7,
    },
    recentMeals: [{
      meal: {
        id: "meal-1",
        ownerKey: "owner-secret",
        consumedAt: Date.parse("2026-08-25T12:00:00Z"),
        source: "telegram",
        caption: "private caption",
        mealType: "lunch",
        status: "complete",
        photoKey: "raw/photo-key",
        photoMimeType: "image/jpeg",
        photoSizeBytes: 123,
        totalCalories: 2_337,
        totalProteinG: 120,
        totalCarbsG: 220,
        totalFatG: 80,
        confidence: 0.9,
        assumptionsJson: "[\"private\"]",
        notes: "private note",
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
        fiberG: 21,
        vitaminCMg: 154,
        confidence: 0.9,
        source: "ai",
        createdAt: 1,
        updatedAt: 1,
      }],
    }, {
      meal: {
        id: "meal-pending",
        ownerKey: "owner-secret",
        consumedAt: Date.parse("2026-08-25T13:00:00Z"),
        source: "telegram",
        caption: "pending caption",
        mealType: "dinner",
        status: "pending",
        photoKey: "raw/pending-photo-key",
        photoMimeType: "image/jpeg",
        photoSizeBytes: 456,
        totalCalories: 999,
        totalProteinG: 50,
        totalCarbsG: 90,
        totalFatG: 30,
        confidence: 0.2,
        assumptionsJson: "[\"private\"]",
        notes: "pending note",
        createdAt: 1,
        updatedAt: 1,
      },
      items: [],
    }, {
      meal: {
        id: "meal-old",
        consumedAt: Date.parse("2026-08-18T12:00:00Z"),
        mealType: "lunch",
        status: "complete",
        photoKey: "raw/old-photo-key",
        photoMimeType: "image/jpeg",
      },
      items: [],
    }],
    recentWeights: [{
      id: "weight-1",
      ownerKey: "owner-secret",
      logicalDate: "2026-08-25",
      weightKg: 74.5,
      recordedAt: Date.parse("2026-08-25T07:30:00Z"),
      createdAt: 1,
      updatedAt: 2,
    }],
    nutrition: {
      today: {
        fiberG: { amount: 21, knownItemCount: 1, totalItemCount: 1, complete: true },
        vitaminCMg: { amount: 154, knownItemCount: 1, totalItemCount: 1, complete: true },
      },
      byDate: [],
    },
  } as never;

  const projection = projectPublicDashboardSummary(summary);
  assert.equal(projection.sevenDay.trend.length, 7);
  assert.equal(projection.sevenDay.trend.at(-1)?.calories, 2_337);
  assert.deepEqual(projection.recentMeals.map((meal) => meal.id), ["meal-1"]);
  const expectedNutrients = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, key === "fiberG" ? 21 : key === "vitaminCMg" ? 154 : null]));
  assert.deepEqual(projection.recentMeals[0], {
    id: "meal-1",
    consumedAt: Date.parse("2026-08-25T12:00:00Z"),
    mealType: "lunch",
    hasPhoto: true,
    totalCalories: 2_337,
    totalProteinG: 120,
    totalCarbsG: 220,
    totalFatG: 80,
    items: [{ name: "Rice bowl", quantity: 1, unit: "serving", calories: 2_337, proteinG: 120, carbsG: 220, fatG: 80, nutrients: expectedNutrients }],
  });
  assert.equal(projection.targets.nutrients.vitaminCMg.value, 200);
  assert.equal(projection.targets.nutrients.vitaminCMg.direction, "minimum");
  assert.equal("source" in projection.targets.nutrients.vitaminCMg, false);
  assert.equal(projection.nutrition.today.vitaminCMg.amount, 154);
  assert.equal("status" in (projection.recentMeals[0] ?? {}), false);
  assert.deepEqual(projection.recentWeights, [{
    logicalDate: "2026-08-25",
    weightKg: 74.5,
    recordedAt: Date.parse("2026-08-25T07:30:00Z"),
  }]);
  assert.equal("id" in (projection.recentWeights[0] ?? {}), false);

  const serialised = JSON.stringify(projection);
  for (const field of [
    "ownerKey", "createdAt", "updatedAt", "photoKey", "caption", "notes",
    "assumptions", "confidence", "source", "provider", "telegram", "export", "rawUsage", "photoMimeType",
  ]) assert.doesNotMatch(serialised, new RegExp(field, "i"));
});

test("public summary does not advertise photos with an unsafe MIME type", () => {
  const projection = projectPublicDashboardSummary({
    date: "2026-08-25",
    targets: { calories: 2_100, proteinG: 150, nutrients: resolveNutrientGoals() },
    today: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, mealCount: 0 },
    sevenDay: {
      calories: 0,
      proteinG: 0,
      averageCalories: 0,
      averageProteinG: 0,
      daysWithMeals: 0,
    },
    recentMeals: [{
      meal: {
        id: "meal-unsafe",
        consumedAt: Date.parse("2026-08-25T12:00:00Z"),
        mealType: "lunch",
        status: "complete",
        photoKey: "private/unsafe-key",
        photoMimeType: "text/html",
        totalCalories: 0,
        totalProteinG: 0,
        totalCarbsG: 0,
        totalFatG: 0,
      },
      items: [],
    }],
    recentWeights: [],
    nutrition: { today: {}, byDate: [] },
  } as never);

  assert.equal(projection.recentMeals[0]?.hasPhoto, false);
});
