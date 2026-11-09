import assert from "node:assert/strict";
import test from "node:test";

import { updateMealItemTotals } from "../app/meal-item-totals";

test("reducing a meal below its other items keeps all submitted totals correct", () => {
  const items = [
    { id: "one", name: "Rice", calories: 200, proteinG: 10, carbsG: 40, fatG: 2 },
    { id: "two", name: "Chicken", calories: 300, proteinG: 30, carbsG: 20, fatG: 10 },
    { id: "three", name: "Sauce", calories: 100, proteinG: 10, carbsG: 10, fatG: 5 },
  ];
  const before = structuredClone(items);
  const result = updateMealItemTotals({ items, changes: { calories: 100, protein: 8, carbs: 3, fat: 0 } });
  for (const [field, expected] of [["calories", 100], ["proteinG", 8], ["carbsG", 3], ["fatG", 0]] as const) {
    assert.equal(result.reduce((sum, item) => sum + (item[field] ?? 0), 0), expected);
    assert.ok(result.every((item) => (item[field] ?? 0) >= 0));
  }
  assert.deepEqual(items, before);
  assert.deepEqual(result.map((item) => item.id), ["one", "two", "three"]);
});

test("ordinary total edits preserve the other items and unrelated nutrition", () => {
  const items = [
    { name: "Rice", calories: 200, proteinG: 5, nutrients: { sodiumMg: 2 } },
    { name: "Chicken", calories: 300, proteinG: 30 },
  ];
  const result = updateMealItemTotals({ items, changes: { calories: 600, name: "Dinner" } });
  assert.deepEqual(result, [{ ...items[0], name: "Dinner", calories: 300 }, items[1]]);
});

test("single-item and empty meals remain supported", () => {
  assert.deepEqual(updateMealItemTotals({ items: [{ name: "Meal" }], changes: { calories: 50 } }), [{ name: "Meal", calories: 50 }]);
  assert.deepEqual(updateMealItemTotals({ items: [], changes: { calories: 50 } }), []);
});
