import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateFoodScenario,
  calculateNutrientSourceDependence,
  calculateNutrientSourceExclusion,
  foodScenarioTradeoffText,
  scenarioFoodCandidates,
} from "../app/insights/nutrient-food-calculations";
import type { InsightEntry, InsightItem } from "../app/insights/types";

function item(name: string, nutrients?: InsightItem["nutrients"], calories = 100, proteinG = 4): InsightItem {
  return { name, calories, proteinG, nutrients };
}

function entry(id: string, date: string, items: InsightItem[]): InsightEntry {
  return {
    id,
    date,
    consumedAt: Date.parse(`${date}T12:00:00.000Z`),
    calories: items.reduce((sum, current) => sum + current.calories, 0),
    proteinG: items.reduce((sum, current) => sum + current.proteinG, 0),
    items,
  };
}

test("food additions scale known values and preserve unknown nutrients", () => {
  const result = calculateFoodScenario({
    mode: "addition",
    item: item("Oatmeal", { fiberG: 5, calciumMg: null, sodiumMg: 0 }, 300, 10),
    multiplier: 1.5,
  });

  assert.equal(result.metrics.find((metric) => metric.key === "calories")?.before, 0);
  assert.equal(result.metrics.find((metric) => metric.key === "calories")?.after, 450);
  assert.equal(result.metrics.find((metric) => metric.key === "fiberG")?.delta, 7.5);
  assert.equal(result.metrics.find((metric) => metric.key === "sodiumMg")?.delta, 0);
  assert.equal(result.metrics.find((metric) => metric.key === "calciumMg")?.before, 0);
  assert.equal(result.metrics.find((metric) => metric.key === "calciumMg")?.after, null);
  assert.equal(result.metrics.find((metric) => metric.key === "calciumMg")?.delta, null);
});

test("food replacements compare the original portion with the scaled replacement", () => {
  const result = calculateFoodScenario({
    mode: "replacement",
    before: item("White rice", { fiberG: 1, sodiumMg: 10 }, 200, 4),
    after: item("Brown rice", { fiberG: 4, sodiumMg: null }, 220, 5),
    multiplier: 0.5,
  });

  assert.equal(result.beforeName, "White rice");
  assert.equal(result.afterName, "Brown rice");
  assert.equal(result.metrics.find((metric) => metric.key === "calories")?.before, 200);
  assert.equal(result.metrics.find((metric) => metric.key === "calories")?.after, 110);
  assert.equal(result.metrics.find((metric) => metric.key === "calories")?.delta, -90);
  assert.equal(result.metrics.find((metric) => metric.key === "fiberG")?.delta, 1);
  assert.equal(result.metrics.find((metric) => metric.key === "sodiumMg")?.delta, null);
  assert.match(foodScenarioTradeoffText(result), /increases Fiber by 1 g/);
  assert.match(foodScenarioTradeoffText(result), /decreases Calories by 90 kcal/);
  assert.match(foodScenarioTradeoffText(result), /tracked values remain unknown/);
});

test("tradeoff copy stays bounded while prioritizing the focused nutrient", () => {
  const result = calculateFoodScenario({
    mode: "addition",
    item: item("Nutrient-rich bowl", {
      fiberG: 6,
      saturatedFatG: 10,
      sodiumMg: 1_800,
      calciumMg: 400,
      potassiumMg: 500,
    }, 200, 12),
  });
  const text = foodScenarioTradeoffText(result, { focusedNutrient: "calciumMg" });
  assert.match(text, /increases Calcium by 400 mg.*Calories by 200 kcal.*Sodium by 1,800 mg.*Saturated fat by 10 g/);
  assert.match(text, /3 other tracked values change in the table/);
  assert.match(text, /\d+ tracked values remain unknown/);
  assert.doesNotMatch(text, /Potassium/);
});

test("scenario candidates use only finished dates in the selected 14 or 28 day window", () => {
  const entries = [
    entry("yesterday", "2026-09-18", [item("Apple")]),
    entry("start", "2026-09-05", [item("Pear")]),
    entry("old", "2026-09-04", [item("Old food")]),
    entry("today", "2026-09-19", [item("Today")]),
  ];
  const candidates = scenarioFoodCandidates({ entries, currentDate: "2026-09-19", range: 14 });
  assert.deepEqual(candidates.map((candidate) => candidate.label), ["Apple", "Pear"]);
  assert.equal(candidates[0]?.id, "yesterday:0");
});

test("scenario candidates can be oriented by a selected nutrient without scoring foods", () => {
  const entries = [
    entry("lower", "2026-09-18", [item("Lower", { calciumMg: 50 })]),
    entry("higher", "2026-09-17", [item("Higher", { calciumMg: 300 })]),
    entry("unknown", "2026-09-16", [item("Unknown")]),
  ];
  const candidates = scenarioFoodCandidates({ entries, currentDate: "2026-09-19", range: 14, prioritizeNutrient: "calciumMg" });
  assert.deepEqual(candidates.map((candidate) => candidate.label), ["Higher", "Lower", "Unknown"]);
});

test("source dependence groups exact names case-insensitively and reconciles top sources with Other", () => {
  const result = calculateNutrientSourceDependence({
    entries: [
      entry("one", "2026-09-18", [item("Yogurt", { calciumMg: 200 }), item("Bread", { calciumMg: 100 })]),
      entry("two", "2026-09-17", [item(" yogurt ", { calciumMg: 300 }), item("Apple", { calciumMg: 50 })]),
      entry("three", "2026-09-16", [item("Cheese", { calciumMg: 400 })]),
    ],
    currentDate: "2026-09-19",
    range: 14,
    nutrientKey: "calciumMg",
    topLimit: 2,
  });

  assert.equal(result.knownTotal, 1_050);
  assert.equal(result.totalItemCount, 5);
  assert.equal(result.knownItemCount, 5);
  assert.deepEqual(result.sources.map((source) => [source.label, source.amount]), [["Yogurt", 500], ["Cheese", 400]]);
  assert.equal(result.other?.amount, 150);
  assert.equal((result.sources.reduce((sum, source) => sum + (source.amount ?? 0), 0) + (result.other?.amount ?? 0)), result.knownTotal);
  assert.equal(result.sources.find((source) => source.label === "Yogurt")?.totalItemCount, 2);
  assert.equal(result.recordedEntryCount, 3);
  assert.equal(result.recordedDayCount, 3);
  assert.equal(result.knownDayCount, 3);
  assert.equal(result.largestSourceShare, 500 / 1_050);
  assert.equal(result.topThreeSourceShare, 1_000 / 1_050);
  assert.equal(result.sources[0]?.entryCount, 2);
  assert.equal(result.sources[0]?.dayCount, 2);
});

test("unknown values remain visible in source coverage and do not become zero", () => {
  const result = calculateNutrientSourceDependence({
    entries: [
      entry("known", "2026-09-18", [item("Tea", { caffeineMg: 30 })]),
      entry("unknown", "2026-09-17", [item("Tea"), item("Water", { caffeineMg: 0 })]),
    ],
    currentDate: "2026-09-19",
    range: 14,
    nutrientKey: "caffeineMg",
  });

  const tea = result.allSources.find((source) => source.label === "Tea");
  assert.equal(result.knownTotal, 30);
  assert.equal(result.unknownItemCount, 1);
  assert.equal(tea?.amount, 30);
  assert.equal(tea?.knownItemCount, 1);
  assert.equal(tea?.totalItemCount, 2);
  assert.equal(tea?.unknownItemCount, 1);
  assert.equal(tea?.entryCount, 2);
  assert.equal(tea?.dayCount, 2);
  assert.equal(tea?.entries[0]?.itemName, "Tea");
  assert.equal(result.allSources.find((source) => source.label === "Water")?.amount, 0);
});

test("source exclusion is a reversible what-if over known recorded values", () => {
  const result = calculateNutrientSourceDependence({
    entries: [
      entry("one", "2026-09-18", [item("Milk", { calciumMg: 250 }), item("Toast", { calciumMg: null })]),
      entry("two", "2026-09-17", [item("Milk", { calciumMg: 300 })]),
    ],
    currentDate: "2026-09-19",
    range: 14,
    nutrientKey: "calciumMg",
  });
  const exclusion = calculateNutrientSourceExclusion(result, "milk");
  assert.equal(exclusion?.excludedKnownAmount, 550);
  assert.equal(exclusion?.remainingKnownAmount, 0);
  assert.equal(exclusion?.excludedUnknownItemCount, 0);
  assert.equal(exclusion?.remainingUnknownItemCount, 1);
  assert.equal(result.allSources.find((source) => source.key === "milk")?.amount, 550);
});
