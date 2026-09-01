import assert from "node:assert/strict";
import test from "node:test";

import { nutrientGoalProgress } from "../app/nutrition/nutrient-meta";
import {
  NUTRIENT_GOAL_DEFINITIONS,
  parseNutrientGoalOverridesJson,
  resolveNutrientGoals,
} from "../domain/nutrient-goals";
import { NUTRIENT_KEYS } from "../domain/nutrients";

test("nutrient goals cover all tracked nutrients with conservative defaults", () => {
  assert.deepEqual(Object.keys(NUTRIENT_GOAL_DEFINITIONS), [...NUTRIENT_KEYS]);
  const goals = resolveNutrientGoals();
  assert.equal(goals.fiberG.value, 28);
  assert.equal(goals.vitaminCMg.value, 90);
  assert.equal(goals.sodiumMg.value, 2_300);
  assert.equal(goals.sodiumMg.direction, "maximum");
  assert.equal(goals.caffeineMg.value, 400);
  assert.equal(goals.omega3G.value, null);
  assert.equal(Object.values(goals).filter((goal) => goal.value === null).length, 4);
});

test("goal overrides can customise or disable defaults and ignore unsafe JSON values", () => {
  const parsed = parseNutrientGoalOverridesJson(JSON.stringify({
    vitaminCMg: 200,
    sodiumMg: null,
    fiberG: -1,
    unknownNutrient: 50,
  }));
  assert.deepEqual(parsed, { vitaminCMg: 200, sodiumMg: null });
  const goals = resolveNutrientGoals(parsed);
  assert.deepEqual(goals.vitaminCMg, { value: 200, direction: "minimum", source: "custom" });
  assert.deepEqual(goals.sodiumMg, { value: null, direction: "maximum", source: "disabled" });
  assert.equal(goals.fiberG.source, "default");
  assert.deepEqual(parseNutrientGoalOverridesJson("not-json"), {});
});

test("progress uses different states for minimum goals and maximum limits", () => {
  assert.equal(nutrientGoalProgress(45, { value: 90, direction: "minimum", source: "default" })?.status, "progress");
  assert.equal(nutrientGoalProgress(90, { value: 90, direction: "minimum", source: "default" })?.status, "complete");
  assert.equal(nutrientGoalProgress(200, { value: 300, direction: "maximum", source: "default" })?.status, "within");
  assert.equal(nutrientGoalProgress(250, { value: 300, direction: "maximum", source: "default" })?.status, "warning");
  assert.equal(nutrientGoalProgress(310, { value: 300, direction: "maximum", source: "default" })?.status, "exceeded");
  assert.equal(nutrientGoalProgress(null, { value: 90, direction: "minimum", source: "default" }), null);
});
