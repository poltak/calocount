import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateWeeklyChanges,
  calculateWaterfall,
  getWeeklyPeriods,
  summarizeMetric,
} from "../app/insights/weekly-changes-calculations";
import type { InsightDay, InsightEntry } from "../app/insights/types";

function day(date: string, calories = 100, proteinG = 10, mealCount = 1): InsightDay {
  return { date, calories, proteinG, mealCount, nutrients: {} };
}

function entry(id: string, date: string, calories: number, items: InsightEntry["items"]): InsightEntry {
  return { id, date, consumedAt: 0, calories, proteinG: 0, items };
}

test("periods are the last two seven-day finished calendar windows and exclude today", () => {
  const dates = Array.from({ length: 16 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`);
  const periods = getWeeklyPeriods(dates.map((date) => day(date)), [], "2026-09-16");

  assert.deepEqual([periods.previous.start, periods.previous.end], ["2026-09-02", "2026-09-08"]);
  assert.deepEqual([periods.current.start, periods.current.end], ["2026-09-09", "2026-09-15"]);
  assert.equal(periods.current.days.some(({ date }) => date === "2026-09-16"), false);
  assert.equal(periods.previous.days.length, 7);
  assert.equal(periods.current.days.length, 7);
});

test("averages use recorded days without filling missing calendar days with zero", () => {
  const result = calculateWeeklyChanges([
    day("2026-09-02", 1_000),
    day("2026-09-08", 2_000),
    day("2026-09-09", 1_500),
    day("2026-09-10", 0, 0, 0),
  ], [], "2026-09-16");

  assert.equal(result.metrics.calories.previous.average, 1_500);
  assert.equal(result.metrics.calories.previous.recordedDays, 2);
  assert.equal(result.metrics.calories.current.average, 1_500);
  assert.equal(result.metrics.calories.current.recordedDays, 1);
});

test("nutrients retain unknown coverage and use the recorded-day denominator", () => {
  const period = getWeeklyPeriods([
    { ...day("2026-09-09"), nutrients: { fiberG: { amount: 12, knownItemCount: 2, totalItemCount: 3, complete: false } } },
    { ...day("2026-09-10"), nutrients: { fiberG: { amount: null, knownItemCount: 0, totalItemCount: 2, complete: false } } },
  ], [], "2026-09-16").current;

  assert.deepEqual(summarizeMetric(period, "fiberG"), {
    key: "fiberG",
    total: 12,
    average: 6,
    recordedDays: 2,
    knownItemCount: 2,
    totalItemCount: 5,
  });
});

test("waterfall normalizes names exactly and reconciles item and entry residuals", () => {
  const days = [day("2026-09-02", 100), day("2026-09-09", 180)];
  const entries = [
    entry("before", "2026-09-02", 100, [{ name: " Coffee ", calories: 80, proteinG: 0 }]),
    entry("after", "2026-09-09", 180, [
      { name: "coffee", calories: 100, proteinG: 0 },
      { name: "Toast", calories: 50, proteinG: 0 },
    ]),
  ];
  const result = calculateWeeklyChanges(days, entries, "2026-09-16");
  const sum = result.waterfall.reduce((total, item) => total + item.difference, 0);

  assert.equal(result.calorieDifference, 80);
  assert.equal(sum, 80);
  assert.equal(result.waterfall.find(({ key }) => key === "food:coffee")?.difference, 20);
  assert.equal(result.waterfall.find(({ key }) => key === "adjustment:entry")?.difference, 10);
});

test("limited attribution rolls smaller contributors into Other entries and still reconciles", () => {
  const previous = getWeeklyPeriods([day("2026-09-02", 0), day("2026-09-09", 100)], [
    entry("after", "2026-09-09", 100, [
      { name: "A", calories: 50, proteinG: 0 },
      { name: "B", calories: 30, proteinG: 0 },
      { name: "C", calories: 20, proteinG: 0 },
    ]),
  ], "2026-09-16");
  const waterfall = calculateWaterfall(previous.previous, previous.current, "calories", 1);

  assert.equal(waterfall.length, 2);
  assert.equal(waterfall[0]?.label, "A");
  assert.equal(waterfall[1]?.label, "Other entries");
  assert.equal(waterfall.reduce((sum, item) => sum + item.difference, 0), 100);
});

test("missing entry history is explicitly unattributed and reconciles to day totals", () => {
  const result = calculateWeeklyChanges([day("2026-09-02", 100), day("2026-09-09", 125)], [], "2026-09-16");
  const unavailable = result.waterfall.find(({ kind }) => kind === "unavailable");

  assert.equal(unavailable?.previous, 100);
  assert.equal(unavailable?.current, 125);
  assert.equal(unavailable?.difference, 25);
  assert.equal(result.waterfall.reduce((sum, item) => sum + item.difference, 0), result.calorieDifference);
});

test("zero totals are available values while an empty period is unavailable", () => {
  const zero = calculateWeeklyChanges([day("2026-09-02", 0), day("2026-09-09", 0)], [], "2026-09-16");
  assert.equal(zero.metrics.calories.previous.average, 0);
  assert.equal(zero.metrics.calories.current.average, 0);
  assert.equal(zero.calorieDifference, 0);

  const empty = calculateWeeklyChanges([day("2026-09-09", 100)], [], "2026-09-16");
  assert.equal(empty.metrics.calories.previous.average, null);
  assert.equal(empty.calorieDifference, null);
  assert.deepEqual(empty.waterfall, []);
});

test("protein and known nutrient waterfalls reconcile and sources keep actual logged amounts", () => {
  const days: InsightDay[] = [
    { ...day("2026-09-02", 100, 10), nutrients: { fiberG: { amount: 5, knownItemCount: 1, totalItemCount: 2, complete: false } } },
    { ...day("2026-09-09", 100, 18), nutrients: { fiberG: { amount: 9, knownItemCount: 1, totalItemCount: 2, complete: false } } },
  ];
  const entries = [
    entry("before", "2026-09-02", 100, [{ name: "Beans", calories: 100, proteinG: 8, nutrients: { fiberG: 5 } }]),
    entry("after", "2026-09-09", 100, [{ name: "Beans", calories: 100, proteinG: 15, nutrients: { fiberG: 7 } }]),
  ];
  entries[0]!.proteinG = 10;
  entries[1]!.proteinG = 18;
  const periods = getWeeklyPeriods(days, entries, "2026-09-16");

  const protein = calculateWaterfall(periods.previous, periods.current, "proteinG");
  assert.equal(protein.reduce((sum, item) => sum + item.difference, 0), 8);
  assert.equal(protein.find(({ key }) => key === "food:beans")?.currentSources[0]?.amount, 15);
  assert.equal(protein.find(({ key }) => key === "food:beans")?.currentSources[0]?.contribution, 15);

  const fiber = calculateWaterfall(periods.previous, periods.current, "fiberG");
  assert.equal(fiber.reduce((sum, item) => sum + item.difference, 0), 4);
  assert.equal(fiber.find(({ kind }) => kind === "unavailable")?.difference, 2);
});
