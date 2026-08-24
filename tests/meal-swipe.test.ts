import assert from "node:assert/strict";
import test from "node:test";

import { getMealSwipeAction, MEAL_SWIPE_THRESHOLD_PX } from "../app/meal-swipe";

test("meal swipe opens only after a deliberate horizontal swipe left", () => {
  assert.equal(getMealSwipeAction({ deltaX: -MEAL_SWIPE_THRESHOLD_PX, deltaY: 0 }), "open");
  assert.equal(getMealSwipeAction({ deltaX: -(MEAL_SWIPE_THRESHOLD_PX - 1), deltaY: 0 }), "none");
  assert.equal(getMealSwipeAction({ deltaX: -80, deltaY: 24 }), "open");
});

test("vertical movement does not open or close meal actions", () => {
  assert.equal(getMealSwipeAction({ deltaX: -70, deltaY: 75 }), "none");
  assert.equal(getMealSwipeAction({ deltaX: 70, deltaY: -75 }), "none");
});

test("horizontal swipe right closes the row", () => {
  assert.equal(getMealSwipeAction({ deltaX: MEAL_SWIPE_THRESHOLD_PX, deltaY: 0 }), "close");
  assert.equal(getMealSwipeAction({ deltaX: 90, deltaY: 10 }), "close");
});
