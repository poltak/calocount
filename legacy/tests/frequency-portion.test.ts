import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateFrequencyPortion,
  frequencyAxisMaximum,
  normalizeFoodName,
  type FrequencyPortionMetric,
  type FrequencyPortionRange,
} from "../app/insights/frequency-portion-calculations";
import type { InsightEntry, InsightItem } from "../app/insights/types";

function entry(id: string, date: string, items: InsightItem[]): InsightEntry {
  return {
    id,
    date,
    consumedAt: Date.parse(`${date}T12:00:00.000Z`),
    calories: items.reduce((total, item) => total + item.calories, 0),
    proteinG: items.reduce((total, item) => total + item.proteinG, 0),
    items,
  };
}

function item(name: string, calories: number, proteinG = 0, nutrients?: InsightItem["nutrients"], quantity?: number, unit?: string): InsightItem {
  return { name, calories, proteinG, nutrients, quantity, unit };
}

function calculate(entries: InsightEntry[], range: FrequencyPortionRange = 7, metric: FrequencyPortionMetric = "calories") {
  return calculateFrequencyPortion({ entries, currentDate: "2026-09-19", range, metric });
}

test("normalizes only exact trimmed, lower-case food names", () => {
  assert.equal(normalizeFoodName("  Iced Coffee  "), "iced coffee");
  const result = calculate([
    entry("1", "2026-09-18", [item("Chicken curry", 500)]),
    entry("2", "2026-09-17", [item(" chicken curry ", 400)]),
    entry("3", "2026-09-16", [item("Chicken curry with rice", 700)]),
  ]);

  assert.equal(result.points.length, 2);
  assert.equal(result.points.find((point) => point.key === "chicken curry")?.occurrences, 2);
  assert.equal(result.points.find((point) => point.key === "chicken curry with rice")?.occurrences, 1);
});

test("counts tea and coffee as foods and keeps separate drink names separate", () => {
  const result = calculate([
    entry("1", "2026-09-18", [item("Coffee", 5, 0, { caffeineMg: 90 })]),
    entry("2", "2026-09-17", [item("Tea", 0, 0, { caffeineMg: 30 })]),
    entry("3", "2026-09-16", [item("Coffee with milk", 40, 2, { caffeineMg: 75 })]),
  ], 7, "caffeineMg");

  assert.deepEqual(result.points.map((point) => point.key).sort(), ["coffee", "coffee with milk", "tea"]);
  assert.equal(result.points.find((point) => point.key === "tea")?.averageValue, 30);
});

test("repeated exact names in one log are one occurrence with summed values and quantity", () => {
  const result = calculate([
    entry("same-log", "2026-09-18", [
      item("Rice", 100, 2, undefined, 1, "cup"),
      item(" rice ", 150, 3, undefined, 0.5, "cup"),
    ]),
    entry("other-log", "2026-09-17", [item("Rice", 200, 4, undefined, 2, "cup")]),
  ]);
  const rice = result.points[0];

  assert.equal(rice?.occurrences, 2);
  assert.equal(rice?.totalValue, 450);
  assert.equal(rice?.averageValue, 225);
  assert.equal(rice?.averageQuantity, 1.75);
  assert.equal(rice?.quantityUnit, "cup");
  assert.equal(rice?.sources.find((source) => source.entryId === "same-log")?.quantity, 1.5);
});

test("known zero is included while missing nutrient values remain unknown", () => {
  const result = calculate([
    entry("zero", "2026-09-18", [item("Herbal tea", 0, 0, { caffeineMg: 0 })]),
    entry("missing", "2026-09-17", [item("Herbal tea", 0, 0)]),
  ], 7, "caffeineMg");
  const tea = result.points[0];

  assert.equal(tea?.occurrences, 2);
  assert.equal(tea?.knownCount, 1);
  assert.equal(tea?.totalValue, 0);
  assert.equal(tea?.averageValue, 0);
  assert.equal(tea?.sources.find((source) => source.entryId === "missing")?.value, null);
});

test("uses complete 7-day boundaries excluding today and a seven-day denominator", () => {
  const result = calculate([
    entry("start", "2026-09-12", [item("Apple", 80)]),
    entry("end", "2026-09-18", [item("Apple", 100)]),
    entry("too-old", "2026-09-11", [item("Apple", 60)]),
    entry("today", "2026-09-19", [item("Apple", 120)]),
  ]);

  assert.equal(result.startDate, "2026-09-12");
  assert.equal(result.endDate, "2026-09-18");
  assert.equal(result.elapsedDays, 7);
  assert.equal(result.points[0]?.occurrences, 2);
  assert.equal(result.points[0]?.occurrencesPerWeek, 2);
});

test("uses complete 30-day boundaries and divides frequency by 30 calendar days", () => {
  const result = calculate([
    entry("start", "2026-08-20", [item("Yogurt", 100)]),
    entry("middle", "2026-09-01", [item("Yogurt", 110)]),
    entry("end", "2026-09-18", [item("Yogurt", 120)]),
    entry("too-old", "2026-08-19", [item("Yogurt", 90)]),
    entry("today", "2026-09-19", [item("Yogurt", 130)]),
  ], 30);

  assert.equal(result.startDate, "2026-08-20");
  assert.equal(result.endDate, "2026-09-18");
  assert.equal(result.points[0]?.occurrences, 3);
  assert.ok(Math.abs((result.points[0]?.occurrencesPerWeek ?? 0) - 0.7) < 1e-12);
});

test("marks a repeated-name entry partial when one matching item lacks the metric", () => {
  const result = calculate([
    entry("mixed", "2026-09-18", [
      item("Coffee", 5, 0, { caffeineMg: 80 }),
      item(" coffee ", 10),
    ]),
  ], 7, "caffeineMg");
  const coffee = result.points[0];

  assert.equal(coffee?.averageValue, 80);
  assert.equal(coffee?.knownCount, 1);
  assert.equal(coffee?.completeKnownCount, 0);
  assert.equal(coffee?.sources[0]?.knownItemCount, 1);
  assert.equal(coffee?.sources[0]?.totalItemCount, 2);
});

test("frequency denominator includes unlogged days rather than only dates with entries", () => {
  const result = calculate([
    entry("one", "2026-09-18", [item("Egg", 70)]),
    entry("two", "2026-09-18", [item("Egg", 70)]),
  ]);

  assert.equal(result.points[0]?.occurrences, 2);
  assert.equal(result.points[0]?.occurrencesPerWeek, 2);
});

test("axis maxima use readable bounds without clipping the largest value", () => {
  assert.equal(frequencyAxisMaximum([0.7]), 1);
  assert.equal(frequencyAxisMaximum([1.01]), 2);
  assert.equal(frequencyAxisMaximum([4.2]), 5);
  assert.equal(frequencyAxisMaximum([241]), 500);
});
