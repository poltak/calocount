import assert from "node:assert/strict";
import test from "node:test";

import { projectPublicDashboardSummary } from "../app/api/_lib/public-summary-projection";

test("public summary projection keeps dashboard data and strips private fields", () => {
  const summary = {
    date: "2026-08-25",
    targets: { calories: 2_100, proteinG: 150 },
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
  } as never;

  const projection = projectPublicDashboardSummary(summary);
  assert.equal(projection.sevenDay.trend.length, 7);
  assert.equal(projection.sevenDay.trend.at(-1)?.calories, 2_337);
  assert.deepEqual(projection.recentMeals.map((meal) => meal.id), ["meal-1"]);
  assert.deepEqual(projection.recentMeals[0], {
    id: "meal-1",
    consumedAt: Date.parse("2026-08-25T12:00:00Z"),
    mealType: "lunch",
    totalCalories: 2_337,
    totalProteinG: 120,
    totalCarbsG: 220,
    totalFatG: 80,
    items: [{ name: "Rice bowl", quantity: 1, unit: "serving", calories: 2_337, proteinG: 120, carbsG: 220, fatG: 80 }],
  });
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
