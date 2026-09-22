import assert from "node:assert/strict";
import test from "node:test";

import {
  hasNutrientProvenance,
  nutrientValueOriginLabel,
  parseNutrientProvenance,
} from "../domain/nutrient-provenance";
import { parseMealResponse } from "../app/dashboard-api";
import { serialiseMeal } from "../app/api/_lib/serialise";
import { nutrientProvenanceFromForm } from "../app/nutrition/meal-nutrition-editor";

test("nutrient provenance keeps only explicit origins for known values", () => {
  const provenance = parseNutrientProvenance({
    fiberG: "label",
    sodiumMg: "database",
    calciumMg: "ai",
    ironMg: "manual",
    vitaminCMg: "photo-import",
    unknownNutrient: "manual",
  }, {
    fiberG: 0,
    sodiumMg: null,
    calciumMg: 120,
    ironMg: 2.5,
    vitaminCMg: 30,
  });

  assert.deepEqual(provenance, {
    fiberG: "label",
    calciumMg: "ai",
    ironMg: "manual",
  });
  assert.equal(hasNutrientProvenance(provenance), true);
  assert.equal(nutrientValueOriginLabel("database"), "Food database");
  assert.equal(nutrientValueOriginLabel(undefined), "Origin unknown");
});

test("dashboard meal parsing preserves value provenance without inferring legacy origins", () => {
  const parsed = parseMealResponse({ meal: {
    id: "meal-provenance",
    consumedAt: Date.parse("2026-09-12T12:00:00Z"),
    totalCalories: 100,
    totalProteinG: 4,
    totalCarbsG: 10,
    totalFatG: 2,
    items: [{
      id: "item-provenance",
      name: "Soup",
      calories: 100,
      proteinG: 4,
      carbsG: 10,
      fatG: 2,
      nutrients: { fiberG: 0, sodiumMg: null, calciumMg: 120, ironMg: 2 },
      nutrientProvenance: { fiberG: "label", sodiumMg: "database", calciumMg: "ai", ironMg: "legacy-source" },
      source: "chatgpt",
    }],
  } });

  assert.ok(parsed);
  assert.deepEqual(parsed.items[0]?.nutrientProvenance, { fiberG: "label", calciumMg: "ai" });
  assert.equal(parsed.items[0]?.nutrientProvenance?.sodiumMg, undefined);
  assert.equal(parsed.items[0]?.nutrientProvenance?.ironMg, undefined);
  assert.equal(parsed.items[0]?.source, "chatgpt");
});

test("form provenance ignores origins for blank nutrient values", () => {
  const form = new FormData();
  form.set("nutrient-fiberG", "0");
  form.set("nutrient-origin-fiberG", "label");
  form.set("nutrient-origin-sodiumMg", "database");
  assert.deepEqual(nutrientProvenanceFromForm(form), { fiberG: "label" });
});

test("legacy meals without provenance remain unknown", () => {
  const parsed = parseMealResponse({ meal: {
    id: "legacy-meal",
    consumedAt: Date.parse("2026-09-12T12:00:00Z"),
    totalCalories: 0,
    totalProteinG: 0,
    totalCarbsG: 0,
    totalFatG: 0,
    items: [{ name: "Legacy item", calories: 0, proteinG: 0, carbsG: 0, fatG: 0, nutrients: { fiberG: 4 } }],
  } });

  assert.ok(parsed);
  assert.equal(parsed.items[0]?.nutrientProvenance, undefined);
});

test("private meal serialization preserves explicit nutrient provenance", () => {
  const serialised = serialiseMeal({
    meal: {
      id: "meal-provenance-roundtrip",
      ownerKey: "owner",
      consumedAt: Date.parse("2026-09-12T12:00:00Z"),
      source: "dashboard",
      caption: "",
      mealType: null,
      status: "complete",
      photoKey: null,
      photoMimeType: null,
      photoSizeBytes: null,
      totalCalories: 100,
      totalProteinG: 4,
      totalCarbsG: 0,
      totalFatG: 0,
      confidence: null,
      assumptionsJson: "[]",
      notes: null,
      externalRequestId: null,
      createdAt: 1,
      updatedAt: 1,
    },
    items: [{
      id: "item-provenance-roundtrip",
      mealId: "meal-provenance-roundtrip",
      ownerKey: "owner",
      name: "Labelled soup",
      quantity: 1,
      unit: "serving",
      calories: 100,
      proteinG: 4,
      carbsG: 0,
      fatG: 0,
      fiberG: 4,
      nutrientProvenanceJson: JSON.stringify({ fiberG: "label", sodiumMg: "database" }),
      confidence: null,
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    }],
  } as never);
  assert.deepEqual(serialised.items[0]?.nutrientProvenance, { fiberG: "label" });
  assert.equal("nutrientProvenanceJson" in (serialised.items[0] ?? {}), false);
});
