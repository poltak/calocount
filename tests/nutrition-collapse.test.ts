import assert from "node:assert/strict";
import test from "node:test";

import {
  NUTRITION_COLLAPSED_STORAGE_KEY,
  readNutritionCollapsed,
  writeNutritionCollapsed,
} from "../app/nutrition/nutrition-collapse";

test("nutrition collapse state reads and writes browser storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };

  assert.equal(readNutritionCollapsed(storage), false);
  writeNutritionCollapsed(storage, true);
  assert.equal(values.get(NUTRITION_COLLAPSED_STORAGE_KEY), "true");
  assert.equal(readNutritionCollapsed(storage), true);
  writeNutritionCollapsed(storage, false);
  assert.equal(readNutritionCollapsed(storage), false);
});

test("nutrition collapse state stays expanded when browser storage is unavailable", () => {
  const storage = {
    getItem() {
      throw new Error("storage blocked");
    },
    setItem() {
      throw new Error("storage blocked");
    },
  };

  assert.equal(readNutritionCollapsed(storage), false);
  assert.doesNotThrow(() => writeNutritionCollapsed(storage, true));
});
