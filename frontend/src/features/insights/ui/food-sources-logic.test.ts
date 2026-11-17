import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../../entries/types.js";
import { calculateFoodSources } from "../utils/food-sources.js";
import { dateAgo, seedDay } from "./insight-test-helpers.js";
import { InsightsLogic } from "./insights-logic.js";

type Seed = (app: FullApplication) => Promise<void>;

function setupTest({
  seed,
  ...params
}: LogicTestParams & { seed?: Seed } = {}) {
  const events = new EventEmitter<EntryEvent>();
  return setupLogicTest(params, async (application) => {
    await seed?.(application);
    return new InsightsLogic({
      ...application.frontend,
      audience: "owner",
      entryEvents: [events],
      settingsEvents: [],
      weightEvents: [],
    });
  });
}

describe("InsightsLogic food sources tests", () => {
  it("should start on 7 days and calories, and keep a choice", async () => {
    const { logic } = await setupTest();

    expect(logic.state.foodSourcesRange).toEqual(7);
    expect(logic.state.foodSourcesMetric).toEqual("calories");
    expect(logic.state.expandedFoodSource).toEqual(null);

    logic.choose({
      foodSourcesRange: 30,
      foodSourcesMetric: "fiberG",
      expandedFoodSource: "eggs",
    });

    expect(logic.state.foodSourcesRange).toEqual(30);
    expect(logic.state.foodSourcesMetric).toEqual("fiberG");
    expect(logic.state.expandedFoodSource).toEqual("eggs");
  });

  it("should add up foods by name, rank them, share the known total and keep the eight largest", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [
            { name: "Eggs", quantity: 2, unit: "large", calories: 300 },
            { name: "Rice", calories: 200 },
            ...Array.from({ length: 8 }, (_, index) => ({
              name: `Small ${index}`,
              calories: 10 + index,
            })),
          ],
        });
        await seedDay(application, {
          date: dateAgo(application, 2),
          items: [{ name: " eggs ", calories: 250 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 9),
          items: [{ name: "Toast", calories: 900 }],
        });
      },
    });
    const { entries, today } = logic.state;
    const currentDate = today ?? "";

    const week = calculateFoodSources({
      entries,
      currentDate,
      range: 7,
      metric: "calories",
    });
    expect(week.sources).toHaveLength(8);
    expect(week.sources[0]).toMatchObject({
      label: "Eggs",
      amount: 550,
      entryCount: 2,
    });
    expect(week.sources[1]?.label).toEqual("Rice");
    expect(week.sources.map((food) => food.label)).not.toContain("Toast");
    expect(week.totalItemCount).toEqual(11);
    expect(week.knownItemCount).toEqual(11);
    expect(week.knownTotal).toEqual(550 + 200 + 108);
    expect(week.sources[0]?.share).toBeCloseTo(550 / 858, 9);
    expect(week.sources[0]?.entries.map((entry) => entry.date)).toEqual([
      dateAgo(app, 1),
      dateAgo(app, 2),
    ]);

    const month = calculateFoodSources({
      entries,
      currentDate,
      range: 30,
      metric: "calories",
    });
    expect(month.sources[0]).toMatchObject({ label: "Toast", amount: 900 });
  });

  it("should keep an unknown value out of the amounts and show it as unknown", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [
            { name: "Oats", fiberG: 4 },
            { name: "Soup" },
            { name: "Oats" },
          ],
        });
      },
    });
    const { entries, today } = logic.state;

    const fiber = calculateFoodSources({
      entries,
      currentDate: today ?? "",
      range: 7,
      metric: "fiberG",
    });

    expect(fiber.knownTotal).toEqual(4);
    expect(fiber.knownItemCount).toEqual(1);
    expect(fiber.totalItemCount).toEqual(3);
    expect(fiber.sources).toHaveLength(1);
    expect(fiber.sources[0]).toMatchObject({
      label: "Oats",
      amount: 4,
      share: 1,
      entryCount: 2,
    });
    expect(fiber.sources[0]?.entries.map((entry) => entry.amount)).toEqual(
      expect.arrayContaining([4, null]),
    );
    expect(
      calculateFoodSources({
        entries,
        currentDate: today ?? "",
        range: 7,
        metric: "sodiumMg",
      }).sources,
    ).toEqual([]);
  });
});
