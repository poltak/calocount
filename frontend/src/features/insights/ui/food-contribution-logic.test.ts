import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../../entries/types.js";
import { calculateFoodContributions } from "../utils/food-contribution.js";
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

describe("InsightsLogic food contribution tests", () => {
  it("should start on 7 days and calories, and keep a choice", async () => {
    const { logic } = await setupTest();

    expect(logic.state.contributionRange).toEqual(7);
    expect(logic.state.contributionMetric).toEqual("calories");

    logic.choose({ contributionRange: 30, contributionMetric: "fiberG" });

    expect(logic.state.contributionRange).toEqual(30);
    expect(logic.state.contributionMetric).toEqual("fiberG");
  });

  it("should add up foods by name, rank them, and keep the six largest", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [
            { name: "Eggs", calories: 300, fiberG: 1 },
            { name: "Rice", calories: 200 },
            { name: "A", calories: 10 },
            { name: "B", calories: 11 },
            { name: "C", calories: 12 },
            { name: "D", calories: 13 },
            { name: "E", calories: 14 },
          ],
        });
        await seedDay(application, {
          date: dateAgo(application, 2),
          items: [{ name: " eggs ", calories: 250, fiberG: 2 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 9),
          items: [{ name: "Toast", calories: 900, fiberG: 5 }],
        });
      },
    });
    const { entries, today } = logic.state;
    const currentDate = today ?? "";

    const week = calculateFoodContributions({
      entries,
      currentDate,
      range: 7,
      metric: "calories",
    });
    expect(week).toHaveLength(6);
    expect(week[0]).toEqual({ label: "Eggs", value: 550, occurrences: 2 });
    expect(week[1]?.label).toEqual("Rice");
    expect(week.map((food) => food.label)).not.toContain("Toast");
    expect(week.map((food) => food.label)).not.toContain("A");

    const month = calculateFoodContributions({
      entries,
      currentDate,
      range: 30,
      metric: "calories",
    });
    expect(month[0]).toEqual({ label: "Toast", value: 900, occurrences: 1 });

    const fiber = calculateFoodContributions({
      entries,
      currentDate,
      range: 30,
      metric: "fiberG",
    });
    expect(fiber.map((food) => [food.label, food.value])).toEqual([
      ["Toast", 5],
      ["Eggs", 3],
    ]);
    expect(
      calculateFoodContributions({
        entries,
        currentDate,
        range: 7,
        metric: "sodiumMg",
      }),
    ).toEqual([]);
  });
});
