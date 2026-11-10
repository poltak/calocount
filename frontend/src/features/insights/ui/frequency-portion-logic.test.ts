import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import {
  calculateFrequencyPortion,
  frequencyAxisMaximum,
  type FrequencyPortionMetric,
} from "@app/common/features/entries/utils/insights/frequency-portion";
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

function resultOf(
  logic: InsightsLogic,
  range: 7 | 30 = 7,
  metric: FrequencyPortionMetric = "calories",
) {
  return calculateFrequencyPortion({
    entries: logic.state.entries,
    currentDate: logic.state.today ?? "",
    range,
    metric,
  });
}

describe("InsightsLogic frequency and portion tests", () => {
  it("should group only exact names after trimming and ignoring case", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "Chicken curry", calories: 500 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 2),
          items: [{ name: "chicken CURRY", calories: 400 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 3),
          items: [{ name: "Chicken curry with rice", calories: 700 }],
        });
      },
    });

    const points = resultOf(logic).points;

    expect(points).toHaveLength(2);
    expect(
      points.find((point) => point.key === "chicken curry")?.occurrences,
    ).toEqual(2);
    expect(
      points.find((point) => point.key === "chicken curry with rice")
        ?.occurrences,
    ).toEqual(1);
  });

  it("should keep drinks with different names apart", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "Coffee", caffeineMg: 90 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 2),
          items: [{ name: "Tea", caffeineMg: 30 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 3),
          items: [{ name: "Coffee with milk", caffeineMg: 75 }],
        });
      },
    });

    const points = resultOf(logic, 7, "caffeineMg").points;

    expect(points.map((point) => point.key).toSorted()).toEqual([
      "coffee",
      "coffee with milk",
      "tea",
    ]);
    expect(points.find((point) => point.key === "tea")?.averageValue).toEqual(
      30,
    );
  });

  it("should count repeated names in one entry as one occurrence", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [
            { name: "Rice", calories: 100, quantity: 1, unit: "cup" },
            { name: " rice ", calories: 150, quantity: 0.5, unit: "cup" },
          ],
        });
        await seedDay(application, {
          date: dateAgo(application, 2),
          items: [{ name: "Rice", calories: 200, quantity: 2, unit: "cup" }],
        });
      },
    });

    const rice = resultOf(logic).points[0];

    expect(rice).toMatchObject({
      occurrences: 2,
      totalValue: 450,
      averageValue: 225,
      averageQuantity: 1.75,
      quantityUnit: "cup",
    });
  });

  it("should include a known zero and keep a missing value unknown", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "Herbal tea", caffeineMg: 0 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 2),
          items: [{ name: "Herbal tea" }],
        });
      },
    });

    const tea = resultOf(logic, 7, "caffeineMg").points[0];

    expect(tea).toMatchObject({
      occurrences: 2,
      knownCount: 1,
      totalValue: 0,
      averageValue: 0,
    });
    expect(tea?.sources.filter((source) => source.value === null)).toHaveLength(
      1,
    );
  });

  it("should use 7-day bounds that end yesterday and divide by 7 days", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        for (const ago of [0, 1, 7, 8]) {
          await seedDay(application, {
            date: dateAgo(application, ago),
            items: [{ name: "Apple", calories: 80 }],
          });
        }
      },
    });

    const result = resultOf(logic);

    expect(result).toMatchObject({
      startDate: dateAgo(app, 7),
      endDate: dateAgo(app, 1),
      elapsedDays: 7,
    });
    expect(result.points[0]).toMatchObject({
      occurrences: 2,
      occurrencesPerWeek: 2,
    });
  });

  it("should divide the 30-day frequency by 30 calendar days, with unlogged days", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        for (const ago of [0, 1, 15, 30, 31]) {
          await seedDay(application, {
            date: dateAgo(application, ago),
            items: [{ name: "Yogurt" }],
          });
        }
      },
    });

    const result = resultOf(logic, 30);

    expect(result.startDate).toEqual(dateAgo(app, 30));
    expect(result.points[0]?.occurrences).toEqual(3);
    expect(result.points[0]?.occurrencesPerWeek).toBeCloseTo(0.7, 12);
  });

  it("should mark an entry partial when one matching item lacks the metric", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "Coffee", caffeineMg: 80 }, { name: " coffee " }],
        });
      },
    });

    const coffee = resultOf(logic, 7, "caffeineMg").points[0];

    expect(coffee).toMatchObject({
      averageValue: 80,
      knownCount: 1,
      completeKnownCount: 0,
    });
    expect(coffee?.sources[0]).toMatchObject({
      knownItemCount: 1,
      totalItemCount: 2,
    });
  });

  it("should round axis maxima up to readable bounds", () => {
    expect(frequencyAxisMaximum([0.7])).toEqual(1);
    expect(frequencyAxisMaximum([1.01])).toEqual(2);
    expect(frequencyAxisMaximum([4.2])).toEqual(5);
    expect(frequencyAxisMaximum([241])).toEqual(500);
  });
});
