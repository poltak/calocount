import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { calculateWeeklyChanges } from "@app/common/features/entries/utils/insights/weekly-changes";
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

function changesOf(logic: InsightsLogic, limit?: number) {
  const { days, entries, today } = logic.state;
  return calculateWeeklyChanges(days, entries, today ?? "", limit);
}

describe("InsightsLogic weekly changes tests", () => {
  it("should compare the two finished weeks and leave today out", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 0),
          items: [{ name: "Today", calories: 9000 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "A", calories: 1000 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 9),
          items: [{ name: "B", calories: 2000 }],
        });
      },
    });

    const result = changesOf(logic);

    expect(result.current).toMatchObject({
      start: dateAgo(app, 7),
      end: dateAgo(app, 1),
    });
    expect(result.previous).toMatchObject({
      start: dateAgo(app, 14),
      end: dateAgo(app, 8),
    });
    expect(result.current.days).toHaveLength(1);
    expect(result.calorieDifference).toEqual(-1000);
  });

  it("should average over recorded days only", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "A", calories: 1000 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 3),
          items: [{ name: "A", calories: 2000 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 10),
          items: [{ name: "A", calories: 1200 }],
        });
      },
    });

    const { metrics, current } = changesOf(logic);

    expect(current.days).toHaveLength(2);
    expect(metrics.calories.current).toMatchObject({
      total: 3000,
      average: 1500,
      recordedDays: 2,
    });
    expect(metrics.calories.previous.average).toEqual(1200);
  });

  it("should say that a comparison needs a recorded day in both periods", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "A", calories: 1000 }],
        });
      },
    });

    const result = changesOf(logic);

    expect(result.calorieDifference).toEqual(null);
    expect(result.metrics.calories.previous.average).toEqual(null);
    expect(result.waterfall).toEqual([]);
  });

  it("should keep unknown nutrient coverage next to the known amount", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "Bread", fiberG: 6 }, { name: "Soup" }],
        });
        await seedDay(application, {
          date: dateAgo(application, 9),
          items: [{ name: "Soup" }],
        });
      },
    });

    const { metrics } = changesOf(logic);

    expect(metrics.fiberG.current).toMatchObject({
      total: 6,
      knownItemCount: 1,
      totalItemCount: 2,
    });
    expect(metrics.fiberG.previous).toMatchObject({
      total: null,
      average: null,
      knownItemCount: 0,
      totalItemCount: 1,
    });
  });

  it("should name the foods that moved the daily average", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 9),
          items: [
            { name: "Toast", calories: 300 },
            { name: "Soup", calories: 200 },
          ],
        });
        await seedDay(application, {
          date: dateAgo(application, 2),
          items: [
            { name: " Toast ", calories: 100 },
            { name: "Pizza", calories: 800 },
          ],
        });
      },
    });

    const { waterfall } = changesOf(logic);

    expect(waterfall.map((item) => [item.label, item.difference])).toEqual([
      ["Pizza", 800],
      ["Soup", -200],
      ["Toast", -200],
    ]);
  });

  it("should fold the smallest changes into Other entries and still add up", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 9),
          items: [{ name: "Old", calories: 100 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 2),
          items: Array.from({ length: 9 }, (_, index) => ({
            name: `Food ${index}`,
            calories: 100 + index,
          })),
        });
      },
    });

    const result = changesOf(logic, 3);

    expect(result.waterfall).toHaveLength(4);
    expect(result.waterfall.at(-1)).toMatchObject({
      key: "other",
      label: "Other entries",
      kind: "other",
    });
    const total = result.waterfall.reduce(
      (sum, item) => sum + item.difference,
      0,
    );
    expect(total).toBeCloseTo(result.calorieDifference ?? Number.NaN, 9);
  });
});
