import assert from "node:assert/strict";
import test from "node:test";

import { getNutritionAttention } from "../app/insights/nutrition-attention-calculations";
import type { InsightDay, InsightEntry } from "../app/insights/types";
import { resolveNutrientGoals } from "../domain/nutrient-goals";
import {
  FDA_DAILY_VALUE_REFERENCE_VERSION,
  FDA_DAILY_VALUE_SOURCE_URL,
  nutrientReferenceForGoal,
  nutrientUpperLimitApplicability,
} from "../domain/nutrient-references";

const completeAggregate = (amount: number) => ({ amount, knownItemCount: 1, totalItemCount: 1, complete: true });
const partialAggregate = (amount: number) => ({ amount, knownItemCount: 1, totalItemCount: 2, complete: false });

function day(date: string, nutrients: InsightDay["nutrients"], mealCount = 1): InsightDay {
  return { date, calories: 2_000, proteinG: 100, mealCount, nutrients };
}

function daysBetween(start: string, count: number, make: (date: string, index: number) => InsightDay) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${start}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return make(date.toISOString().slice(0, 10), index);
  });
}

function entriesBetween(
  start: string,
  count: number,
  nutrients: Record<string, number | null>,
): InsightEntry[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${start}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    return {
      id: `entry-${dateKey}`,
      date: dateKey,
      consumedAt: date.getTime() + 12 * 60 * 60 * 1000,
      calories: 2_000,
      proteinG: 100,
      items: [{ name: "Tracked item", quantity: 1, unit: "serving", calories: 2_000, proteinG: 100, nutrients }],
    };
  });
}

test("shortfall means use complete logged past days and require two five-day weeks", () => {
  const days = daysBetween("2026-09-05", 14, (date, index) => {
    // Ten complete days are eligible: five in each week. The two partial days
    // and two unlogged days must not be smoothed into the mean.
    if (index === 5 || index === 12) return day(date, { calciumMg: partialAggregate(1) });
    if (index === 6 || index === 13) return day(date, {}, 0);
    return day(date, { calciumMg: completeAggregate(index === 0 ? 0 : 500) });
  });
  const result = getNutritionAttention({
    days: [...days, day("2026-09-19", { calciumMg: completeAggregate(10) })],
    currentDate: "2026-09-19",
    goals: resolveNutrientGoals(),
    windowDays: 14,
  });
  const calcium = result.nutrients.calciumMg;

  assert.deepEqual(result.findings.map((finding) => finding.nutrient), ["calciumMg"]);
  assert.equal(calcium.coverage.calendarDays, 14);
  assert.equal(calcium.coverage.loggedDays, 12);
  assert.equal(calcium.coverage.unloggedDays, 2);
  assert.equal(calcium.coverage.completeDays, 10);
  assert.equal(calcium.coverage.partialDays, 2);
  assert.equal(calcium.shortfall.eligibleDays, 10);
  assert.equal(calcium.shortfall.mean, 450);
  assert.equal(calcium.shortfall.weeksBelowReference, 2);
  assert.equal(calcium.shortfall.persistent, true);
  assert.equal(calcium.currentDay.amount, 10);
  assert.equal(calcium.shortfall.reference?.type, "intake-reference");
});

test("known zero is eligible, while partial and unlogged days remain visible as coverage gaps", () => {
  const result = getNutritionAttention({
    days: [
      day("2026-09-18", { fiberG: completeAggregate(0) }),
      day("2026-09-17", { fiberG: partialAggregate(12) }),
    ],
    currentDate: "2026-09-19",
    goals: resolveNutrientGoals(),
    windowDays: 14,
  });
  const fiber = result.nutrients.fiberG;

  assert.equal(fiber.shortfall.mean, 0);
  assert.equal(fiber.shortfall.eligibleDays, 1);
  assert.equal(fiber.coverage.partialDays, 1);
  assert.equal(fiber.coverage.unknownLoggedDays, 0);
  assert.equal(fiber.coverage.unloggedDays, 12);
  assert.equal(fiber.days.find((item) => item.date === "2026-09-17")?.status, "partial");
});

test("an FDA intake reference is not promoted to an excess guideline", () => {
  const recorded = [day("2026-09-18", { cholesterolMg: completeAggregate(350) })];
  const defaults = getNutritionAttention({ days: recorded, currentDate: "2026-09-19", goals: resolveNutrientGoals(), windowDays: 14 });
  assert.equal(defaults.nutrients.cholesterolMg.excess.reference, null);

  const personal = getNutritionAttention({ days: recorded, currentDate: "2026-09-19", goals: resolveNutrientGoals({ cholesterolMg: 250 }), windowDays: 14 });
  assert.equal(personal.nutrients.cholesterolMg.excess.reference?.type, "personal-goal");
  assert.equal(personal.nutrients.cholesterolMg.excess.observedAboveDays, 1);
});

test("a partial current sodium sum can be observed above a guideline without entering past repetition counts", () => {
  const past = daysBetween("2026-09-05", 14, (date, index) => {
    if (index < 2) return day(date, { sodiumMg: partialAggregate(2_400) });
    return day(date, { sodiumMg: completeAggregate(1_500) });
  });
  const result = getNutritionAttention({
    days: [...past, day("2026-09-19", { sodiumMg: partialAggregate(2_500) })],
    currentDate: "2026-09-19",
    goals: resolveNutrientGoals(),
    windowDays: 14,
  });
  const sodium = result.nutrients.sodiumMg;

  assert.equal(sodium.excess.reference?.type, "guideline");
  assert.equal(sodium.excess.reference?.label, "Sodium guideline");
  assert.equal(sodium.excess.reference?.authority, "FDA Daily Value");
  assert.equal(sodium.excess.reference?.sourceUrl, FDA_DAILY_VALUE_SOURCE_URL);
  assert.equal(sodium.excess.observedAboveDays, 2);
  assert.deepEqual(sodium.excess.aboveDates, ["2026-09-05", "2026-09-06"]);
  assert.equal(sodium.excess.current.status, "partial");
  assert.equal(sodium.excess.current.aboveReference, true);
  assert.equal(sodium.excess.repeated, true);
  assert.equal(sodium.excess.meanKnown, sodium.excess.averageKnown);
  assert.equal(sodium.excess.maximumRecorded, 2_400);
  assert.equal(sodium.excess.dayClassifications[0]?.classification, "above");
  assert.equal(sodium.excess.dayClassifications[2]?.classification, "at-or-below");
  assert.equal(result.findings.find((finding) => finding.nutrient === "sodiumMg")?.kind, "excess");
});

test("custom sodium and saturated-fat maximums are personal goals, while unsupported ULs are absent", () => {
  const goals = resolveNutrientGoals({ sodiumMg: 1_800, saturatedFatG: 15 });
  const sodium = nutrientReferenceForGoal("sodiumMg", goals.sodiumMg);
  const saturatedFat = nutrientReferenceForGoal("saturatedFatG", goals.saturatedFatG);
  assert.equal(sodium?.type, "personal-goal");
  assert.equal(sodium?.authority, "User settings");
  assert.equal(sodium?.sourceUrl, null);
  assert.equal(saturatedFat?.type, "personal-goal");
  assert.equal(saturatedFat?.authority, "User settings");
  assert.equal(saturatedFat?.sourceUrl, null);
  assert.equal(saturatedFat?.sourceScope, "user-defined");
  assert.equal(saturatedFat?.referenceVersion, "user-settings");
  assert.equal(saturatedFat?.reviewDate, null);
  const defaultSodium = nutrientReferenceForGoal("sodiumMg", resolveNutrientGoals().sodiumMg);
  assert.equal(defaultSodium?.referenceVersion, FDA_DAILY_VALUE_REFERENCE_VERSION);
  assert.equal(defaultSodium?.population, "general population 4+");
  assert.equal(defaultSodium?.sourceScope, "total-intake");
  assert.equal(defaultSodium?.reviewDate, "2026-09-22");
  assert.equal(nutrientReferenceForGoal("vitaminB6Mg", goals.vitaminB6Mg)?.type, "intake-reference");
  assert.equal("upperLimit" in (nutrientReferenceForGoal("vitaminB6Mg", goals.vitaminB6Mg) ?? {}), false);
  assert.equal("upperLimit" in (nutrientReferenceForGoal("vitaminAMcgRae", goals.vitaminAMcgRae) ?? {}), false);
  assert.equal("upperLimit" in (nutrientReferenceForGoal("magnesiumMg", goals.magnesiumMg) ?? {}), false);
  assert.equal("upperLimit" in (nutrientReferenceForGoal("folateMcgDfe", goals.folateMcgDfe) ?? {}), false);
});

test("a high B12 intake reference does not become an excess finding, and disabled goals stay descriptive", () => {
  const goals = resolveNutrientGoals({ fiberG: null });
  const result = getNutritionAttention({
    days: daysBetween("2026-09-05", 14, (date) => day(date, { vitaminB12Mcg: completeAggregate(100) })),
    currentDate: "2026-09-19",
    goals,
    windowDays: 14,
  });

  assert.equal(result.nutrients.vitaminB12Mcg.excess.reference, null);
  assert.equal(result.nutrients.vitaminB12Mcg.excess.status, "unsupported");
  assert.equal(result.findings.some((finding) => finding.nutrient === "vitaminB12Mcg"), false);
  assert.equal(result.nutrients.fiberG.shortfall.reference, null);
  assert.equal(result.nutrients.fiberG.shortfall.status, "unsupported");
});

test("twenty complete days and two five-day weeks are required for a 28-day persistent finding", () => {
  const days = daysBetween("2026-08-22", 28, (date, index) => {
    if (index === 6 || index === 13 || index === 20 || index === 27) return day(date, {}, 0);
    return day(date, { potassiumMg: completeAggregate(1_000) });
  });
  const result = getNutritionAttention({
    days,
    currentDate: "2026-09-19",
    goals: resolveNutrientGoals(),
    windowDays: 28,
  });
  const potassium = result.nutrients.potassiumMg;

  assert.equal(result.startDate, "2026-08-22");
  assert.equal(result.endDate, "2026-09-18");
  assert.equal(result.minimumEligibleDays, 20);
  assert.equal(potassium.shortfall.eligibleDays, 24);
  assert.equal(potassium.shortfall.weeklyMeans.filter((week) => week.belowReference).length, 4);
  assert.equal(potassium.shortfall.persistent, true);
});

test("vitamin and mineral upper limits stay unsupported for total-only nutrient fields", () => {
  const definitions = [
    ["vitaminB6Mg", ["population"]],
    ["vitaminAMcgRae", ["population", "form", "unit"]],
    ["magnesiumMg", ["population", "source"]],
    ["folateMcgDfe", ["population", "source", "form", "unit"]],
    ["vitaminEMg", ["population", "source", "form"]],
  ] as const;
  const nutrients = Object.fromEntries(definitions.map(([key]) => [key, completeAggregate(10_000)]));
  const result = getNutritionAttention({
    days: daysBetween("2026-09-05", 14, (date) => day(date, nutrients)),
    currentDate: "2026-09-19",
    goals: resolveNutrientGoals(),
    windowDays: 14,
  });

  for (const [key, requiredData] of definitions) {
    const upperLimit = result.nutrients[key].excess.upperLimit;
    assert.equal(upperLimit.status, "unsupported");
    assert.equal(upperLimit.reason, "missing-applicability-data");
    assert.equal(upperLimit.reference, null);
    assert.deepEqual(upperLimit.missingRequirements, requiredData);
    assert.ok(upperLimit.definition);
    assert.equal(result.findings.some((finding) => finding.nutrient === key && finding.kind === "excess"), false);
  }

  const b12 = result.nutrients.vitaminB12Mcg.excess.upperLimit;
  assert.equal(b12.definition, null);
  assert.equal(b12.reason, "no-established-upper-limit");
  assert.equal(b12.status, "unsupported");
});

test("upper-limit applicability exposes the source and form gate without treating a definition as active", () => {
  const magnesium = nutrientUpperLimitApplicability("magnesiumMg");
  assert.equal(magnesium.status, "unsupported");
  assert.equal(magnesium.reason, "missing-applicability-data");
  assert.equal(magnesium.reference, null);
  assert.deepEqual(magnesium.missingRequirements, ["population", "source"]);
  assert.equal(magnesium.definition?.sourceScope, "supplement-or-medication");

  const vitaminA = nutrientUpperLimitApplicability("vitaminAMcgRae");
  assert.equal(vitaminA.definition?.formScope?.includes("preformed"), true);
  assert.equal(vitaminA.definition?.unit, "mcg");
  assert.equal(vitaminA.reference, null);
});

test("an explicit US FNB adult confirmation enables only the supported total B6 UL", () => {
  const result = getNutritionAttention({
    days: daysBetween("2026-09-05", 14, (date) => day(date, { vitaminB6Mg: completeAggregate(120) })),
    currentDate: "2026-09-19",
    goals: resolveNutrientGoals(),
    windowDays: 14,
    referenceSettings: { vitaminB6UsFnbAdultUlEnabled: true },
  });
  const b6 = result.nutrients.vitaminB6Mg.excess.upperLimit;
  assert.equal(b6.status, "repeated");
  assert.equal(b6.reason, null);
  assert.equal(b6.reference?.id, "vitaminB6:nih-ods-us-fnb-ul");
  assert.equal(b6.reference?.value, 100);
  assert.equal(b6.observedAboveDays, 14);
  assert.equal(b6.meanKnown, 120);
  assert.equal(b6.maximumRecorded, 120);
  assert.equal(b6.dayClassifications.every((day) => day.classification === "above"), true);
  assert.equal(result.findings.find((finding) => finding.nutrient === "vitaminB6Mg")?.reference.type, "upper-limit");

  const disabled = getNutritionAttention({
    days: daysBetween("2026-09-05", 14, (date) => day(date, { vitaminB6Mg: completeAggregate(120) })),
    currentDate: "2026-09-19",
    goals: resolveNutrientGoals(),
    windowDays: 14,
  });
  assert.equal(disabled.nutrients.vitaminB6Mg.excess.upperLimit.reference, null);
  assert.equal(disabled.nutrients.vitaminB6Mg.excess.upperLimit.reason, "missing-applicability-data");
  assert.equal(disabled.findings.some((finding) => finding.nutrient === "vitaminB6Mg" && finding.kind === "excess"), false);
});

test("the legacy B6 confirmation cannot unlock source/form-specific ULs", () => {
  const entries = entriesBetween("2026-09-05", 14, { preformedVitaminAMcgRae: 4_000 });
  const result = getNutritionAttention({
    days: daysBetween("2026-09-05", 14, (date) => day(date, { vitaminAMcgRae: completeAggregate(10_000) })),
    entries,
    currentDate: "2026-09-19",
    goals: resolveNutrientGoals(),
    windowDays: 14,
    referenceSettings: { vitaminB6UsFnbAdultUlEnabled: true },
  });
  const upperLimit = result.nutrients.vitaminAMcgRae.excess.upperLimit;
  assert.equal(upperLimit.reference, null);
  assert.equal(upperLimit.reason, "missing-applicability-data");
  assert.deepEqual(upperLimit.missingRequirements, ["population", "form", "unit"]);
});

test("explicit U.S. FNB adult profile compares only recorded source/form amounts", () => {
  const sourceEntries = entriesBetween("2026-09-05", 14, {
    preformedVitaminAMcgRae: 4_000,
    supplementalMagnesiumMg: 400,
    folicAcidMcg: 1_200,
    supplementalVitaminEMg: 1_200,
  });
  const result = getNutritionAttention({
    days: daysBetween("2026-09-05", 14, (date) => day(date, {
      // These totals deliberately do not determine any of the UL amounts.
      vitaminAMcgRae: completeAggregate(10_000),
      magnesiumMg: completeAggregate(10_000),
      folateMcgDfe: completeAggregate(10_000),
      vitaminEMg: completeAggregate(10_000),
    })),
    entries: sourceEntries,
    currentDate: "2026-09-19",
    goals: resolveNutrientGoals(),
    windowDays: 14,
    referenceSettings: { usFnbAdultUlEnabled: true },
  });

  for (const key of ["vitaminAMcgRae", "magnesiumMg", "folateMcgDfe", "vitaminEMg"] as const) {
    const upperLimit = result.nutrients[key].excess.upperLimit;
    assert.equal(upperLimit.status, "repeated");
    assert.equal(upperLimit.reason, null);
    assert.equal(upperLimit.observedAboveDays, 14);
    assert.equal(upperLimit.maximumRecorded !== null, true);
  }
  assert.equal(result.nutrients.vitaminAMcgRae.excess.upperLimit.reference?.unit, "mcg");
  assert.equal(result.nutrients.folateMcgDfe.excess.upperLimit.reference?.unit, "mcg folic acid");
  assert.equal(result.nutrients.magnesiumMg.excess.upperLimit.maximumRecorded, 400);
  assert.equal(result.nutrients.vitaminEMg.excess.upperLimit.maximumRecorded, 1_200);
});

test("total magnesium alone never triggers the supplemental magnesium UL", () => {
  const entries = entriesBetween("2026-09-05", 14, {});
  const result = getNutritionAttention({
    days: daysBetween("2026-09-05", 14, (date) => day(date, { magnesiumMg: completeAggregate(1_000) })),
    entries,
    currentDate: "2026-09-19",
    goals: resolveNutrientGoals(),
    windowDays: 14,
    referenceSettings: { usFnbAdultUlEnabled: true },
  });
  const upperLimit = result.nutrients.magnesiumMg.excess.upperLimit;
  assert.equal(upperLimit.status, "unsupported");
  assert.equal(upperLimit.reference, null);
  assert.deepEqual(upperLimit.missingRequirements, ["source"]);
  assert.equal(result.findings.some((finding) => finding.nutrient === "magnesiumMg"), false);
});

test("partial source/form data is classified as indeterminate when it does not cross the UL", () => {
  const entries = entriesBetween("2026-09-05", 14, { supplementalMagnesiumMg: 200 });
  entries[0]!.items.push({ name: "Unclassified supplement", calories: 0, proteinG: 0, nutrients: {} });
  const result = getNutritionAttention({
    days: daysBetween("2026-09-05", 14, (date) => day(date, { magnesiumMg: completeAggregate(1_000) })),
    entries,
    currentDate: "2026-09-19",
    goals: resolveNutrientGoals(),
    windowDays: 14,
    referenceSettings: { usFnbAdultUlEnabled: true },
  });
  const upperLimit = result.nutrients.magnesiumMg.excess.upperLimit;
  assert.equal(upperLimit.status, "no-excess-observed");
  assert.equal(upperLimit.observedDays, 14);
  assert.equal(upperLimit.completeAtOrBelowDays, 13);
  assert.equal(upperLimit.indeterminateDays, 1);
  assert.equal(upperLimit.dayClassifications[0]?.classification, "indeterminate");
});
