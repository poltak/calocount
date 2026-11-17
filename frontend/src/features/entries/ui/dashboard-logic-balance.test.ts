import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { DashboardLogic } from "./dashboard-logic.js";
import {
  patchSettings,
  saveWeight,
  type Seed,
} from "./dashboard-test-setup.js";
import { dateAgo, seedEntryAgo, todayKey } from "./entry-test-helpers.js";

/** A dashboard on a database that `seed` fills first. */
function setupTest({
  seed,
  ...params
}: LogicTestParams & { seed?: Seed } = {}) {
  return setupLogicTest(params, async (application) => {
    await seed?.(application);
    return new DashboardLogic({
      ...application.frontend,
      audience: "owner",
      entryEvents: [],
      settingsEvents: [],
      weightEvents: [],
    });
  });
}

/** Log 2,000 kcal on each of the days, from `first` to `last` days ago, except the skipped ones. */
async function logDays(
  app: Parameters<Seed>[0],
  {
    first,
    last,
    skip = [],
    fatG = 100,
    saturatedFatG = 10,
    fiberG = 25,
  }: {
    first: number;
    last: number;
    skip?: number[];
    fatG?: number;
    saturatedFatG?: number | ((daysAgo: number) => number);
    fiberG?: number | ((daysAgo: number) => number);
  },
) {
  for (let daysAgo = first; daysAgo <= last; daysAgo += 1) {
    if (skip.includes(daysAgo)) {
      continue;
    }
    await seedEntryAgo(app, daysAgo, {
      items: [
        {
          name: "Meal",
          calories: 2000,
          fatG,
          saturatedFatG:
            typeof saturatedFatG === "function"
              ? saturatedFatG(daysAgo)
              : saturatedFatG,
          fiberG: typeof fiberG === "function" ? fiberG(daysAgo) : fiberG,
        },
      ],
    });
  }
}

/** A weight every `step` days from `first` to `last` days ago, falling 0.1 kg a day. */
async function fallingWeights(
  app: Parameters<Seed>[0],
  { first, last, step }: { first: number; last: number; step: number },
) {
  for (let daysAgo = first; daysAgo >= last; daysAgo -= step) {
    await saveWeight(app, dateAgo(app, daysAgo), 80 - (28 - daysAgo) / 10);
  }
}

describe("DashboardLogic maintenance estimate tests", () => {
  it("should add the energy of the weight change to the mean intake of the 28 finished days", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await logDays(application, { first: 1, last: 28 });
        // Today is not finished, and it must not change the estimate.
        await seedEntryAgo(application, 0, { calories: 6000 });
        await fallingWeights(application, { first: 28, last: 2, step: 2 });
        await saveWeight(application, todayKey(application), 60);
      },
    });

    // 2,000 kcal a day, and 0.1 kg lost a day: 770 kcal a day more.
    expect(logic.maintenanceEstimate).toEqual({
      kcalPerDay: 2770,
      fromDate: dateAgo(app, 28),
      toDate: dateAgo(app, 1),
    });
  });

  it("should have no estimate with fewer than 21 logged days", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await logDays(application, {
          first: 1,
          last: 28,
          skip: [3, 6, 9, 12, 15, 18, 21, 24],
        });
        await fallingWeights(application, { first: 28, last: 2, step: 2 });
      },
    });

    expect(logic.maintenanceEstimate).toBeNull();
  });

  it("should give an estimate with 10 weights", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await logDays(application, { first: 1, last: 28 });
        await fallingWeights(application, { first: 28, last: 10, step: 2 });
      },
    });

    expect(logic.state.historyWeights).toHaveLength(10);
    expect(logic.maintenanceEstimate).not.toBeNull();
  });

  it("should have no estimate with 9 weights", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await logDays(application, { first: 1, last: 28 });
        await fallingWeights(application, { first: 28, last: 12, step: 2 });
      },
    });

    expect(logic.state.historyWeights).toHaveLength(9);
    expect(logic.maintenanceEstimate).toBeNull();
  });

  it("should have no estimate when the weights span fewer than 14 days", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await logDays(application, { first: 1, last: 28 });
        await fallingWeights(application, { first: 14, last: 2, step: 1 });
      },
    });

    expect(logic.state.historyWeights).toHaveLength(13);
    expect(logic.maintenanceEstimate).toBeNull();
  });
});

describe("DashboardLogic weight change tests", () => {
  it("should compare the first week of weights with the last week", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await saveWeight(application, dateAgo(application, 40), 90);
        await saveWeight(application, dateAgo(application, 38), 88);
        await saveWeight(application, dateAgo(application, 20), 70);
        await saveWeight(application, dateAgo(application, 3), 86);
        await saveWeight(application, todayKey(application), 84);
      },
    });

    // The mean of the first week is 89 kg, and the mean of the last is 85 kg.
    expect(logic.weightChange).toEqual({
      changeKg: -4,
      fromDate: dateAgo(app, 40),
    });
  });

  it("should have no change with one weight", async () => {
    const { logic } = await setupTest({
      seed: (application) => saveWeight(application, todayKey(application), 80),
    });

    expect(logic.weightChange).toBeNull();
  });

  it("should have no change with weights inside one week", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await saveWeight(application, dateAgo(application, 6), 80);
        await saveWeight(application, todayKey(application), 79);
      },
    });

    expect(logic.weightChange).toBeNull();
  });
});

describe("DashboardLogic four-week balance tests", () => {
  it("should read the fat share, the saturated fat days and the fiber of the 28 finished days", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        // 26 logged days. The first ten, but two skipped, go over the 20 g limit.
        await logDays(application, {
          first: 1,
          last: 28,
          skip: [5, 6],
          fatG: 100,
          saturatedFatG: (daysAgo) => (daysAgo <= 10 ? 25 : 10),
          fiberG: (daysAgo) => (daysAgo % 2 === 0 ? 20 : 30),
        });
        // The 28 days before: 14 logged days with a lower fat share.
        await logDays(application, { first: 29, last: 42, fatG: 80 });
        // Today is not finished, and it must not count.
        await logDays(application, { first: 0, last: 0, fatG: 500 });
      },
    });

    expect(logic.fourWeekBalance).toEqual({
      fatSharePercent: 45,
      previousFatSharePercent: 36,
      saturatedFat: { limitG: 20, daysOver: 8, loggedDays: 26 },
      fiber: { averageG: 25, goalG: 28 },
    });
  });

  it("should leave out the earlier share with fewer than 14 logged days, and the saturated fat when the goal is off", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await patchSettings(application, {
          nutrientTargets: { saturatedFatG: null },
        });
        await logDays(application, { first: 1, last: 10 });
        await logDays(application, { first: 29, last: 41, fatG: 80 });
      },
    });

    expect(logic.fourWeekBalance).toMatchObject({
      fatSharePercent: 45,
      previousFatSharePercent: null,
      saturatedFat: null,
    });
  });

  it("should have no balance with fewer than 7 logged days", async () => {
    const { logic } = await setupTest({
      seed: (application) => logDays(application, { first: 1, last: 6 }),
    });

    expect(logic.fourWeekBalance).toBeNull();
  });
});
