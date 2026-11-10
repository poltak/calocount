import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { getNutritionAttention } from "@app/common/features/entries/utils/insights/nutrition-attention";
import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../../entries/types.js";
import {
  dateAgo,
  patchSettings,
  seedDay,
  type SeedItem,
} from "./insight-test-helpers.js";
import { InsightsLogic } from "./insights-logic.js";

type Seed = (app: FullApplication) => Promise<void>;

async function setupTest({
  seed,
  ...params
}: LogicTestParams & { seed?: Seed } = {}) {
  const events = new EventEmitter<EntryEvent>();
  const app = await setupLogicTest(params, async (application) => {
    await seed?.(application);
    return new InsightsLogic({
      ...application.frontend,
      entryEvents: [events],
      settingsEvents: [],
      weightEvents: [],
    });
  });
  return { ...app, events };
}

function attentionOf(logic: InsightsLogic, windowDays: 14 | 28 = 14) {
  const { days, entries, today, nutrientGoals, referenceSettings } =
    logic.state;
  return getNutritionAttention({
    days,
    entries,
    currentDate: today ?? "",
    goals: nutrientGoals,
    windowDays,
    referenceSettings,
  });
}

/** One entry on each of the given days before today. */
async function seedDays(
  app: FullApplication,
  ago: number[],
  item: (daysAgo: number) => SeedItem,
) {
  for (const daysAgo of ago) {
    await seedDay(app, { date: dateAgo(app, daysAgo), items: [item(daysAgo)] });
  }
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

describe("InsightsLogic nutrition attention tests", () => {
  it("should find a persistent shortfall from complete days of two eligible weeks", async () => {
    const { logic } = await setupTest({
      seed: (application) =>
        seedDays(application, range(1, 14), () => ({
          name: "Plain rice",
          fiberG: 10,
        })),
    });

    const model = attentionOf(logic);
    const fiber = model.nutrients.fiberG.shortfall;

    expect(fiber).toMatchObject({
      status: "persistent",
      eligibleDays: 14,
      weeksBelowReference: 2,
    });
    expect(fiber.meanPercent).toBeCloseTo((10 / 28) * 100, 9);
    expect(
      model.findings.map((finding) => [
        finding.rank,
        finding.nutrient,
        finding.kind,
      ]),
    ).toEqual([[1, "fiberG", "shortfall"]]);
  });

  it("should need enough complete days, and treat a known zero as eligible", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDays(application, range(1, 9), () => ({
          name: "Rice",
          fiberG: 0,
        }));
        await seedDay(application, {
          date: dateAgo(application, 10),
          items: [{ name: "Rice", fiberG: 5 }, { name: "Soup" }],
        });
        await seedDay(application, {
          date: dateAgo(application, 11),
          items: [{ name: "Soup" }],
        });
      },
    });

    const { shortfall, coverage } = attentionOf(logic).nutrients.fiberG;

    expect(shortfall).toMatchObject({
      status: "insufficient-data",
      eligibleDays: 9,
      minimumEligibleDays: 10,
    });
    expect(coverage).toMatchObject({
      completeDays: 9,
      partialDays: 1,
      unknownLoggedDays: 1,
      unloggedDays: 3,
      knownDays: 10,
    });
  });

  it("should need twenty complete days for a 28-day finding", async () => {
    const { logic } = await setupTest({
      seed: (application) =>
        seedDays(application, range(1, 19), () => ({
          name: "Rice",
          fiberG: 10,
        })),
    });

    expect(attentionOf(logic, 28).nutrients.fiberG.shortfall.status).toEqual(
      "insufficient-data",
    );
    expect(attentionOf(logic, 14).nutrients.fiberG.shortfall.status).toEqual(
      "persistent",
    );
  });

  it("should find repeated excess over a guideline, and not over an intake reference", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDays(application, [1, 3], () => ({
          name: "Ramen",
          sodiumMg: 3000,
          vitaminB6Mg: 99_999,
        }));
        await seedDays(application, [5], () => ({
          name: "Salad",
          sodiumMg: 500,
        }));
      },
    });

    const model = attentionOf(logic);

    expect(model.nutrients.sodiumMg.excess).toMatchObject({
      status: "repeated",
      observedDays: 3,
      observedAboveDays: 2,
      maximumRecorded: 3000,
      completeAtOrBelowDays: 1,
    });
    expect(model.nutrients.vitaminB6Mg.excess.reference).toEqual(null);
    expect(model.findings).toMatchObject([
      { nutrient: "sodiumMg", kind: "excess", observedAboveDays: 2 },
    ]);
  });

  it("should call a custom maximum a personal goal", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await patchSettings(application, {
          nutrientTargets: { sodiumMg: 1000 },
        });
        await seedDays(application, [1], () => ({
          name: "Ramen",
          sodiumMg: 1500,
        }));
      },
    });

    expect(
      attentionOf(logic).nutrients.sodiumMg.excess.reference,
    ).toMatchObject({
      type: "personal-goal",
      value: 1000,
    });
  });

  it("should apply the B6 upper limit only after the owner confirmed the adult profile", async () => {
    const { logic, ...app } = await setupTest({
      seed: (application) =>
        seedDays(application, [1, 2], () => ({
          name: "Tablet",
          vitaminB6Mg: 120,
        })),
    });

    const before = attentionOf(logic).nutrients.vitaminB6Mg.excess.upperLimit;
    expect(before).toMatchObject({
      reference: null,
      reason: "missing-applicability-data",
    });

    await patchSettings(app, { vitaminB6UsFnbAdultUlEnabled: true });
    await logic.load();
    const model = attentionOf(logic);

    expect(model.nutrients.vitaminB6Mg.excess.upperLimit).toMatchObject({
      status: "repeated",
      observedAboveDays: 2,
    });
    expect(model.findings).toMatchObject([
      { nutrient: "vitaminB6Mg", kind: "excess" },
    ]);
  });

  it("should not let the B6 confirmation unlock source or form limits", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await patchSettings(application, {
          vitaminB6UsFnbAdultUlEnabled: true,
        });
        await seedDays(application, [1, 2], () => ({
          name: "Cereal",
          magnesiumMg: 500,
          supplementalMagnesiumMg: 400,
        }));
      },
    });

    expect(
      attentionOf(logic).nutrients.magnesiumMg.excess.upperLimit,
    ).toMatchObject({
      reference: null,
      reason: "missing-applicability-data",
    });
  });

  it("should compare only the recorded source amount once the adult profile is confirmed", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await patchSettings(application, { usFnbAdultUlEnabled: true });
        await seedDays(application, [1, 2], () => ({
          name: "Tablet",
          magnesiumMg: 900,
          supplementalMagnesiumMg: 400,
        }));
        await seedDays(application, [3], () => ({
          name: "Food",
          magnesiumMg: 900,
        }));
      },
    });

    const upperLimit =
      attentionOf(logic).nutrients.magnesiumMg.excess.upperLimit;

    expect(upperLimit).toMatchObject({
      status: "repeated",
      dataKey: "supplementalMagnesiumMg",
      observedAboveDays: 2,
      observedDays: 2,
    });
  });

  it("should not take total magnesium for the supplemental amount", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await patchSettings(application, { usFnbAdultUlEnabled: true });
        await seedDays(application, [1, 2], () => ({
          name: "Food",
          magnesiumMg: 900,
        }));
      },
    });

    expect(
      attentionOf(logic).nutrients.magnesiumMg.excess.upperLimit.reference,
    ).toEqual(null);
  });
});
