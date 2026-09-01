import assert from "node:assert/strict";
import test from "node:test";

import { NUTRIENT_KEYS } from "../domain/nutrients";
import {
  buildCompleteMealFixtures,
  EXAMPLE_MEAL_DATE,
  EXAMPLE_MEALS,
  type CompleteMealFixture,
} from "./fixtures/example-meals";

const MEAL_FIELDS = [
  "assumptions",
  "caption",
  "confidence",
  "consumedAt",
  "id",
  "items",
  "mealType",
  "notes",
  "photoKey",
  "photoMimeType",
  "photoSizeBytes",
  "source",
  "status",
];

const ITEM_FIELDS = [
  "calories",
  "carbsG",
  "confidence",
  "fatG",
  "id",
  "name",
  "proteinG",
  "quantity",
  "source",
  "unit",
];

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function assertCompleteFixture(meal: CompleteMealFixture): void {
  assert.deepEqual(sorted(Object.keys(meal)), sorted(MEAL_FIELDS));
  assert.match(meal.id, /^fixture-meal-\d{4}-\d{2}-\d{2}-/u);
  assert.equal(meal.status, "complete");
  assert.ok(meal.caption.length > 0);
  assert.ok(meal.mealType);
  assert.ok(Number.isFinite(meal.consumedAt));
  assert.ok(meal.confidence >= 0 && meal.confidence <= 1);
  assert.ok(Array.isArray(meal.assumptions));
  assert.equal(meal.photoKey, null);
  assert.equal(meal.photoMimeType, null);
  assert.equal(meal.photoSizeBytes, null);

  assert.ok(meal.items.length >= 3);
  for (const item of meal.items) {
    assert.deepEqual(
      sorted(Object.keys(item)),
      sorted([...ITEM_FIELDS, ...NUTRIENT_KEYS]),
    );
    assert.ok(item.id.startsWith(`${meal.id}-item-`));
    assert.ok(item.name.length > 0);
    assert.ok(item.quantity > 0);
    assert.ok(item.unit.length > 0);
    assert.ok(Number.isFinite(item.calories) && item.calories > 0);
    for (const macro of ["proteinG", "carbsG", "fatG"] as const) {
      assert.ok(Number.isFinite(item[macro]) && item[macro] >= 0);
    }
    assert.ok(item.confidence >= 0 && item.confidence <= 1);
    for (const key of NUTRIENT_KEYS) {
      const value = item[key];
      assert.equal(typeof value, "number", `${meal.id}/${item.id}/${key}`);
      assert.ok(Number.isFinite(value), `${meal.id}/${item.id}/${key}`);
      assert.ok(value >= 0, `${meal.id}/${item.id}/${key}`);
    }
  }

}

test("builds 21 complete meals for the seven logical dates ending at the anchor", () => {
  const fixtures = buildCompleteMealFixtures({
    anchorDate: EXAMPLE_MEAL_DATE,
    timezone: "Asia/Ho_Chi_Minh",
  });

  assert.equal(fixtures.length, 21);
  assert.equal(new Set(fixtures.map((meal) => meal.id)).size, 21);
  assert.equal(new Set(fixtures.flatMap((meal) => meal.items.map((item) => item.id))).size, fixtures.reduce((count, meal) => count + meal.items.length, 0));
  assert.equal(new Set(fixtures.map((meal) => new Date(meal.consumedAt).toISOString().slice(0, 10))).size, 7);
  assert.equal(new Date(fixtures[0]?.consumedAt ?? 0).toISOString(), "2026-08-26T00:30:00.000Z");
  assert.equal(new Date(fixtures.at(-1)?.consumedAt ?? 0).toISOString(), "2026-09-01T12:00:00.000Z");

  for (const meal of fixtures) assertCompleteFixture(meal);
});

test("exports stable default examples and supports a different anchor date", () => {
  assert.equal(EXAMPLE_MEALS.length, 21);
  assert.deepEqual(EXAMPLE_MEALS.map((meal) => meal.id), buildCompleteMealFixtures({ anchorDate: EXAMPLE_MEAL_DATE }).map((meal) => meal.id));

  const shifted = buildCompleteMealFixtures({ anchorDate: "2026-09-08" });
  assert.equal(shifted.length, 21);
  assert.equal(new Date(shifted.at(-1)?.consumedAt ?? 0).toISOString(), "2026-09-08T12:00:00.000Z");
  assert.notEqual(shifted[0]?.id, EXAMPLE_MEALS[0]?.id);
});
