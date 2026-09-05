import assert from "node:assert/strict";
import test from "node:test";

import {
  NUTRIENT_KEYS,
  NUTRIENT_META,
} from "../domain/nutrients";
import { calculateNutrientAggregates } from "../db/repository";
import { parseAddMealRequest } from "../app/api/_lib/add-meal";
import { serialiseMeal } from "../app/api/_lib/serialise";

const REQUEST_ID = "c5a84680-d0c7-4af6-a4f5-89495c3923ec";

test("the shared nutrient catalogue contains the final 24 fields", () => {
  assert.equal(NUTRIENT_KEYS.length, 24);
  assert.deepEqual(NUTRIENT_META.map((entry) => entry.key), NUTRIENT_KEYS);
  assert.ok(NUTRIENT_META.every((entry) => entry.maximum > 0 && entry.precision >= 0));
});

test("nutrient aggregates preserve unknown values and explicit zero", () => {
  const aggregates = calculateNutrientAggregates([
    { fiberG: 4.5, sodiumMg: 0 },
    { fiberG: null, sodiumMg: 120 },
  ]);

  assert.deepEqual(aggregates.fiberG, {
    amount: 4.5,
    knownItemCount: 1,
    totalItemCount: 2,
    complete: false,
  });
  assert.deepEqual(aggregates.sodiumMg, {
    amount: 120,
    knownItemCount: 2,
    totalItemCount: 2,
    complete: true,
  });
  assert.deepEqual(aggregates.vitaminCMg, {
    amount: null,
    knownItemCount: 0,
    totalItemCount: 2,
    complete: false,
  });
});

test("ChatGPT Action accepts an optional nested nutrient object", () => {
  const parsed = parseAddMealRequest({
    request_id: REQUEST_ID,
    name: "Coffee and toast",
    kcal: 250,
    protein: 8,
    carbs: 35,
    fat: 8,
    eaten_at: "2026-08-30T18:25:00+07:00",
    nutrients: { fiberG: 2, caffeineMg: 95, vitaminB12Mcg: null },
  });
  assert.deepEqual(parsed.nutrients, { fiberG: 2, caffeineMg: 95, vitaminB12Mcg: null });
});

test("JSON meal serialization keeps nullable nutrient item columns", () => {
  const serialized = serialiseMeal({
    meal: {
      id: "meal-1",
      ownerKey: "private-owner",
      consumedAt: 1_700_000_000_000,
      source: "dashboard",
      caption: "Soup",
      mealType: "lunch",
      status: "complete",
      photoKey: null,
      photoMimeType: null,
      photoSizeBytes: null,
      totalCalories: 200,
      totalProteinG: 12,
      totalCarbsG: 20,
      totalFatG: 5,
      confidence: null,
      assumptionsJson: "[]",
      notes: null,
      externalRequestId: null,
      createdAt: 1,
      updatedAt: 1,
    },
    items: [{
      id: "item-1",
      mealId: "meal-1",
      ownerKey: "private-owner",
      name: "Soup",
      quantity: 1,
      unit: "bowl",
      calories: 200,
      proteinG: 12,
      carbsG: 20,
      fatG: 5,
      fiberG: 4,
      vitaminB12Mcg: null,
      confidence: null,
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    }],
  } as never);

  assert.equal(serialized.items[0]?.fiberG, 4);
  assert.equal(serialized.items[0]?.vitaminB12Mcg, null);
  assert.equal("ownerKey" in (serialized.items[0] ?? {}), false);
});
