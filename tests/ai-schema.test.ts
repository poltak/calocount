import assert from "node:assert/strict";
import test from "node:test";

import {
  MealAnalysisValidationError,
  validateMealAnalysis,
} from "../workers/ingest/schema";

const validAnalysis = {
  summary: "Rice and grilled chicken",
  items: [
    {
      name: "Chicken",
      serving: "one breast",
      grams: 180,
      calories: 300,
      proteinGrams: 50,
      carbsGrams: 0,
      fatGrams: 8,
      confidence: "medium",
      assumptions: ["No added oil counted"],
    },
    {
      name: "Rice",
      serving: "one bowl",
      grams: 200,
      calories: 260,
      proteinGrams: 5,
      carbsGrams: 56,
      fatGrams: 1,
      confidence: "high",
      assumptions: [],
    },
  ],
  totals: {
    // Deliberately inaccurate: the Worker recalculates totals from items.
    calories: 1,
    proteinGrams: 1,
    carbsGrams: 1,
    fatGrams: 1,
  },
  confidence: "medium",
  assumptions: [],
  questions: [],
};

test("meal analysis is strict and totals are recalculated", () => {
  const result = validateMealAnalysis(validAnalysis);
  assert.deepEqual(result.totals, {
    calories: 560,
    proteinGrams: 55,
    carbsGrams: 56,
    fatGrams: 9,
  });
});
test("meal analysis rejects unknown properties and malformed numbers", () => {
  assert.throws(
    () => validateMealAnalysis({ ...validAnalysis, extra: true }),
    MealAnalysisValidationError,
  );
  assert.throws(
    () =>
      validateMealAnalysis({
        ...validAnalysis,
        items: [{ ...validAnalysis.items[0], calories: Number.NaN }, validAnalysis.items[1]],
      }),
    MealAnalysisValidationError,
  );
});
