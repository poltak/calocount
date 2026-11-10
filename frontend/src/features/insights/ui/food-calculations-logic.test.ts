import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import {
  calculateFoodScenario,
  foodScenarioTradeoffText,
  scenarioFoodCandidates,
} from "@app/common/features/entries/utils/insights/nutrient-food-scenario";
import {
  OTHER_SOURCE_KEY,
  calculateNutrientSourceDependence,
  calculateNutrientSourceExclusion,
} from "@app/common/features/entries/utils/insights/nutrient-sources";
import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../../entries/types.js";
import { dateAgo, seedDay } from "./insight-test-helpers.js";
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

function candidatesOf(
  logic: InsightsLogic,
  range: 14 | 28,
  prioritizeNutrient?: "fiberG",
) {
  return scenarioFoodCandidates({
    entries: logic.state.entries,
    currentDate: logic.state.today ?? "",
    range,
    ...(prioritizeNutrient ? { prioritizeNutrient } : {}),
  });
}

function sourcesOf(logic: InsightsLogic, topLimit?: number) {
  return calculateNutrientSourceDependence({
    entries: logic.state.entries,
    currentDate: logic.state.today ?? "",
    range: 28,
    nutrientKey: "fiberG",
    ...(topLimit === undefined ? {} : { topLimit }),
  });
}

describe("InsightsLogic food comparison tests", () => {
  it("should add a logged portion and keep unknown nutrients unknown", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "Oats", calories: 300, proteinG: 10, fiberG: 4 }],
        });
      },
    });
    const item = candidatesOf(logic, 14)[0]?.item;
    if (!item) {
      throw new Error("The seed item is missing.");
    }

    const result = calculateFoodScenario({
      mode: "addition",
      item,
      multiplier: 1.5,
    });

    const metric = (key: string) =>
      result.metrics.find((entry) => entry.key === key);
    expect(metric("calories")).toMatchObject({
      before: 0,
      after: 450,
      delta: 450,
    });
    expect(metric("fiberG")).toMatchObject({ after: 6, delta: 6 });
    expect(metric("sodiumMg")).toMatchObject({ after: null, delta: null });
    expect(foodScenarioTradeoffText(result)).toContain(
      "increases Calories by 450 kcal",
    );
    expect(foodScenarioTradeoffText(result)).toContain("remain unknown");
  });

  it("should compare a replacement with the food it replaces", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [
            { name: "Chips", calories: 500, sodiumMg: 600 },
            { name: "Apple", calories: 80, sodiumMg: null },
          ],
        });
      },
    });
    const items = candidatesOf(logic, 14).map((candidate) => candidate.item);
    const chips = items.find((item) => item.name === "Chips");
    const apple = items.find((item) => item.name === "Apple");
    if (!chips || !apple) {
      throw new Error("The seed items are missing.");
    }

    const result = calculateFoodScenario({
      mode: "replacement",
      before: chips,
      after: apple,
    });

    expect(
      result.metrics.find((entry) => entry.key === "calories")?.delta,
    ).toEqual(-420);
    expect(
      result.metrics.find((entry) => entry.key === "sodiumMg")?.delta,
    ).toEqual(null);
    expect(foodScenarioTradeoffText(result)).toContain(
      "decreases Calories by 420 kcal",
    );
  });

  it("should offer portions of finished days inside the window, newest first", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        for (const ago of [0, 1, 14, 15]) {
          await seedDay(application, {
            date: dateAgo(application, ago),
            items: [{ name: `Day ${ago}` }],
          });
        }
      },
    });

    expect(candidatesOf(logic, 14).map((candidate) => candidate.date)).toEqual([
      dateAgo(app, 1),
      dateAgo(app, 14),
    ]);
  });

  it("should list the portions with a known amount of the focused nutrient first", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "Unknown" }, { name: "Little", fiberG: 1 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 2),
          items: [{ name: "Much", fiberG: 9 }],
        });
      },
    });

    expect(
      candidatesOf(logic, 14, "fiberG").map((candidate) => candidate.label),
    ).toEqual(["Much", "Little", "Unknown"]);
  });

  it("should share a nutrient between sources by exact name, with unknown values counted", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [
            { name: "Oats", fiberG: 6 },
            { name: "Bread", fiberG: 2 },
          ],
        });
        await seedDay(application, {
          date: dateAgo(application, 2),
          items: [{ name: " oats ", fiberG: 2 }, { name: "Soup" }],
        });
      },
    });

    const result = sourcesOf(logic);

    expect(result).toMatchObject({
      knownTotal: 10,
      knownItemCount: 3,
      totalItemCount: 4,
      unknownItemCount: 1,
    });
    expect(
      result.sources.map((source) => [source.key, source.amount, source.share]),
    ).toEqual([
      ["oats", 8, 0.8],
      ["bread", 2, 0.2],
      ["soup", null, null],
    ]);
    expect(result.largestSourceShare).toEqual(0.8);
  });

  it("should fold the sources beyond the top ones into one row", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: ["A", "B", "C", "D"].map((name, index) => ({
            name,
            fiberG: 4 - index,
          })),
        });
      },
    });

    const result = sourcesOf(logic, 2);

    expect(result.sources.map((source) => source.key)).toEqual(["a", "b"]);
    expect(result.other).toMatchObject({
      key: OTHER_SOURCE_KEY,
      amount: 3,
      entryCount: 2,
    });
  });

  it("should leave the result unchanged when a source is excluded", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "Oats", fiberG: 6 }, { name: "Soup" }],
        });
      },
    });
    const result = sourcesOf(logic);
    const before = structuredClone(result);

    const oats = calculateNutrientSourceExclusion(result, "oats");
    const soup = calculateNutrientSourceExclusion(result, "soup");

    expect(oats).toMatchObject({
      excludedKnownAmount: 6,
      remainingKnownAmount: 0,
      remainingUnknownItemCount: 1,
    });
    expect(soup).toMatchObject({
      excludedKnownAmount: null,
      remainingKnownAmount: 6,
      excludedUnknownItemCount: 1,
    });
    expect(calculateNutrientSourceExclusion(result, "missing")).toEqual(null);
    expect(result).toEqual(before);
  });
});
