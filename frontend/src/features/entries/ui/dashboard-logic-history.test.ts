import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { DashboardLogic } from "./dashboard-logic.js";
import { saveWeight, type Seed } from "./dashboard-test-setup.js";
import { dateAgo, seedEntryAgo, todayKey } from "./entry-test-helpers.js";

/** A dashboard on a database that `seed` fills first. */
function setupTest({
  seed,
  audience = "owner",
  ...params
}: LogicTestParams & { seed?: Seed; audience?: "owner" | "public" } = {}) {
  return setupLogicTest(params, async (application) => {
    if (audience === "public") {
      const response = await application.frontend.api.settings.$patch({
        json: { publicViewEnabled: true },
      });
      expect(response.status).toEqual(200);
    }
    await seed?.(application);
    return new DashboardLogic({
      ...application.frontend,
      audience,
      entryEvents: [],
      settingsEvents: [],
      weightEvents: [],
    });
  });
}

describe("DashboardLogic history tests", () => {
  it("should read a year of days with entries and of weights", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await seedEntryAgo(application, 0, { calories: 400 });
        await seedEntryAgo(application, 100, { calories: 900, proteinG: 30 });
        await seedEntryAgo(application, 364, { calories: 700 });
        await seedEntryAgo(application, 365, { calories: 600 });
        await saveWeight(application, dateAgo(application, 200), 81.5);
        await saveWeight(application, dateAgo(application, 365), 90);
      },
    });

    expect(logic.state.historyDays.map((day) => day.date)).toEqual([
      dateAgo(app, 364),
      dateAgo(app, 100),
      todayKey(app),
    ]);
    expect(logic.state.historyDays[1]).toMatchObject({
      calories: 900,
      proteinG: 30,
      mealCount: 1,
    });
    expect(logic.state.historyWeights).toMatchObject([
      { logicalDate: dateAgo(app, 200), weightKg: 81.5 },
    ]);
  });

  it("should give a visitor the same history, with the weight rows emptied", async () => {
    const { logic, ...app } = await setupTest({
      audience: "public",
      seed: async (application) => {
        await seedEntryAgo(application, 50, { calories: 500 });
        await saveWeight(application, dateAgo(application, 60), 70);
      },
    });

    expect(logic.state.historyDays).toMatchObject([
      { date: dateAgo(app, 50), calories: 500 },
    ]);
    expect(logic.state.historyWeights).toMatchObject([
      { logicalDate: dateAgo(app, 60), weightKg: 70, createdAt: 0 },
    ]);
  });
});

describe("DashboardLogic all-time weight tests", () => {
  it("should show every day from the first weight to today, and end it when the range changes", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await saveWeight(application, dateAgo(application, 100), 80);
        await saveWeight(application, dateAgo(application, 10), 78);
      },
    });
    expect(logic.state.weightAllTime).toEqual(false);
    expect(logic.weightTrendDates).toHaveLength(7);

    logic.showAllTimeWeight();

    expect(logic.state.weightAllTime).toEqual(true);
    expect(logic.weightTrendDates).toHaveLength(101);
    expect(logic.weightTrendDates[0]).toEqual(dateAgo(app, 100));
    expect(logic.weightTrendDates.at(-1)).toEqual(todayKey(app));
    expect(logic.weightTrendWeights.map((weight) => weight.weightKg)).toEqual([
      80, 78,
    ]);

    logic.setTrendRange({ range: 30 });

    expect(logic.state.weightAllTime).toEqual(false);
    expect(logic.state.trendRange).toEqual(30);
    expect(logic.weightTrendDates).toHaveLength(30);
    expect(logic.weightTrendWeights.map((weight) => weight.weightKg)).toEqual([
      78,
    ]);
  });

  it("should keep the trend range when there is no weight to start from", async () => {
    const { logic } = await setupTest();

    logic.showAllTimeWeight();

    expect(logic.state.weightAllTime).toEqual(true);
    expect(logic.weightTrendDates).toHaveLength(7);
  });
});

describe("DashboardLogic logging streak tests", () => {
  it("should count the days in a row that end today", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        for (const days of [0, 1, 2, 4]) {
          await seedEntryAgo(application, days);
        }
      },
    });

    expect(logic.loggingStreak).toEqual(3);
  });

  it("should count back from yesterday while today has no entry", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        for (const days of [1, 2, 5]) {
          await seedEntryAgo(application, days);
        }
      },
    });

    expect(logic.loggingStreak).toEqual(2);
  });

  it("should have no streak when neither today nor yesterday has an entry", async () => {
    const { logic } = await setupTest({
      seed: (application) => seedEntryAgo(application, 2).then(() => undefined),
    });

    expect(logic.loggingStreak).toEqual(0);
  });
});

describe("DashboardLogic nutrition details tests", () => {
  it("should start closed and remember that the owner opened them", async () => {
    const { frontend, logic } = await setupTest();
    const { browserStorage } = frontend;
    expect(logic.state.nutritionOpen).toEqual(false);

    logic.toggleNutritionSection();

    expect(logic.state.nutritionOpen).toEqual(true);
    expect(browserStorage.getItem("calocount:nutrition-details-open")).toEqual(
      "true",
    );
    const later = new DashboardLogic({
      ...frontend,
      audience: "owner",
      entryEvents: [],
      settingsEvents: [],
      weightEvents: [],
    });
    await later.initialize();
    expect(later.state.nutritionOpen).toEqual(true);
    await later.cleanup();

    logic.toggleNutritionSection();
    expect(logic.state.nutritionOpen).toEqual(false);
    expect(browserStorage.getItem("calocount:nutrition-details-open")).toEqual(
      "false",
    );
  });

  it("should ignore the choice that the old key kept", async () => {
    const { frontend } = await setupTest();
    frontend.browserStorage.setItem("calocount:nutrition-collapsed", "true");
    const later = new DashboardLogic({
      ...frontend,
      audience: "owner",
      entryEvents: [],
      settingsEvents: [],
      weightEvents: [],
    });

    await later.initialize();

    expect(later.state.nutritionOpen).toEqual(false);
    await later.cleanup();
  });
});
