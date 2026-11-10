import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../types.js";
import { calculateMacroTrend } from "../utils/dashboard-calculations.js";
import { DashboardLogic } from "./dashboard-logic.js";
import {
  patchSettings,
  saveWeight,
  type Seed,
} from "./dashboard-test-setup.js";
import {
  HOUR_MS,
  dateAgo,
  seedEntry,
  startOfToday,
  todayKey,
} from "./entry-test-helpers.js";

/** A dashboard on a database that `seed` fills first. */
function setupTest({
  seed,
  ...params
}: LogicTestParams & { seed?: Seed } = {}) {
  const events = new EventEmitter<EntryEvent>();
  return setupLogicTest(params, async (application) => {
    await seed?.(application);
    return new DashboardLogic({
      ...application.frontend,
      entryEvents: [events],
      settingsEvents: [],
      weightEvents: [],
    });
  });
}

/** An entry `days` before today at noon. */
function entryAgo(
  app: Parameters<Seed>[0],
  days: number,
  fields: { calories?: number; proteinG?: number } = {},
) {
  return seedEntry(app, {
    ...fields,
    consumedAt: startOfToday(app) - days * 24 * HOUR_MS + 12 * HOUR_MS,
  });
}

describe("DashboardLogic trend range tests", () => {
  it("should read 30 days for the charts and 7 for the date strip", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await entryAgo(application, 0, { calories: 500 });
        await entryAgo(application, 20, { calories: 800 });
      },
    });

    expect(logic.state.days).toHaveLength(7);
    expect(logic.state.trendDays).toHaveLength(30);
    expect(logic.state.trendDays[0]?.date).toEqual(dateAgo(app, 29));
    expect(logic.state.trendDays.at(-1)?.date).toEqual(todayKey(app));
    expect(logic.state.trendDays.at(-7)?.date).toEqual(
      logic.state.days[0]?.date,
    );
    expect(
      logic.state.trendDays.find((day) => day.date === dateAgo(app, 20)),
    ).toMatchObject({
      calories: 800,
      mealCount: 1,
    });
  });

  it("should show the last 7 days, and the last 30 days when the owner picks them", async () => {
    const { logic, ...app } = await setupTest();

    expect(logic.state.trendRange).toEqual(7);
    expect(logic.visibleTrendDays.map((day) => day.date)).toEqual(
      logic.state.days.map((day) => day.date),
    );
    logic.setTrendRange({ range: 30 });
    expect(logic.visibleTrendDays).toHaveLength(30);
    expect(logic.visibleTrendDays[0]?.date).toEqual(dateAgo(app, 29));
    logic.setTrendRange({ range: 7 });
    expect(logic.visibleTrendDays).toHaveLength(7);
  });

  it("should keep the range when the dashboard reads again", async () => {
    const { logic } = await setupTest();
    logic.setTrendRange({ range: 30 });

    await logic.loadDashboard();

    expect(logic.state.trendRange).toEqual(30);
    expect(logic.visibleTrendDays).toHaveLength(30);
  });

  it("should leave out pending entries from the days of the range", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, {
          calories: 700,
          status: "pending",
          consumedAt:
            startOfToday(application) - 10 * 24 * HOUR_MS + 12 * HOUR_MS,
        });
      },
    });

    expect(
      logic.state.trendDays.find((day) => day.date === dateAgo(app, 10)),
    ).toMatchObject({ calories: 0, mealCount: 0 });
  });

  it("should give the macro split of each day in the range", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, {
          consumedAt: startOfToday(application) + 8 * HOUR_MS,
          items: [
            {
              name: "Lunch",
              calories: 500,
              proteinG: 30,
              carbsG: 50,
              fatG: 20,
            },
          ],
        });
      },
    });
    logic.setTrendRange({ range: 30 });

    const trend = calculateMacroTrend(logic.visibleTrendDays);

    expect(trend).toHaveLength(30);
    expect(trend.at(-1)).toEqual({
      date: todayKey(app),
      percentages: { carbs: 40, protein: 24, fat: 36 },
      hasData: true,
    });
    expect(trend.filter((day) => !day.hasData)).toHaveLength(29);
  });
});

describe("DashboardLogic trend weights and targets tests", () => {
  it("should read the weights of the 30 days, and of the 7 recent days apart", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await saveWeight(application, dateAgo(application, 25), 72);
        await saveWeight(application, dateAgo(application, 2), 70);
        await saveWeight(application, dateAgo(application, 45), 75);
      },
    });

    expect(
      logic.state.trendWeights.map((weight) => weight.logicalDate),
    ).toEqual([dateAgo(app, 25), dateAgo(app, 2)]);
    expect(
      logic.state.recentWeights.map((weight) => weight.logicalDate),
    ).toEqual([dateAgo(app, 2)]);
  });

  it("should give a fixed protein target for each day", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await patchSettings(application, {
          proteinGoalMode: "grams",
          dailyProteinTargetG: 120,
        });
      },
    });

    expect(logic.state.proteinTargets).toHaveLength(30);
    expect(
      logic.state.proteinTargets.every((day) => day.targetG === 120),
    ).toEqual(true);
  });

  it("should give a target per kilogram from the latest weight on or before each day", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await patchSettings(application, {
          proteinGoalMode: "gramsPerKg",
          dailyProteinTargetPerKg: 2,
        });
        await saveWeight(application, dateAgo(application, 40), 80);
        await saveWeight(application, dateAgo(application, 5), 70);
      },
    });

    const targets = new Map(
      logic.state.proteinTargets.map((day) => [day.date, day.targetG]),
    );
    // The weight from before the range covers the first days.
    expect(targets.get(dateAgo(app, 29))).toEqual(160);
    expect(targets.get(dateAgo(app, 6))).toEqual(160);
    expect(targets.get(dateAgo(app, 5))).toEqual(140);
    expect(targets.get(todayKey(app))).toEqual(140);
  });

  it("should give no target before the first weight when the goal is per kilogram", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await patchSettings(application, {
          proteinGoalMode: "gramsPerKg",
          dailyProteinTargetPerKg: 2,
        });
        await saveWeight(application, dateAgo(application, 3), 70);
      },
    });

    const targets = new Map(
      logic.state.proteinTargets.map((day) => [day.date, day.targetG]),
    );
    expect(targets.get(dateAgo(app, 4))).toEqual(null);
    expect(targets.get(dateAgo(app, 3))).toEqual(140);
  });
});

describe("DashboardLogic calendar tests", () => {
  it("should open the calendar on the month of the day in view and close it", async () => {
    const { logic, ...app } = await setupTest();
    await logic.selectDate({ date: dateAgo(app, 35) });

    logic.toggleCalendar();

    expect(logic.state.showCalendar).toEqual(true);
    expect(logic.state.calendarMonth).toEqual(dateAgo(app, 35).slice(0, 7));
    logic.toggleCalendar();
    expect(logic.state.showCalendar).toEqual(false);
    expect(logic.state.calendarMonth).toEqual(null);
  });

  it("should open a day from the calendar and close the calendar", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await entryAgo(application, 35, { calories: 650 });
      },
    });
    logic.toggleCalendar();

    await logic.selectCalendarDate({ date: dateAgo(app, 35) });

    expect(logic.state.showCalendar).toEqual(false);
    expect(logic.state.selectedDate).toEqual(dateAgo(app, 35));
    expect(logic.state.entries).toHaveLength(1);
  });

  it("should close the calendar and keep the day when the owner picks a future day", async () => {
    const { logic, ...app } = await setupTest();
    logic.toggleCalendar();

    await logic.selectCalendarDate({ date: "2999-01-01" });

    expect(logic.state.showCalendar).toEqual(false);
    expect(logic.state.selectedDate).toEqual(todayKey(app));
  });

  it("should change the reload key with each read of the dashboard", async () => {
    const { logic } = await setupTest();
    const first = logic.state.reloadKey;

    await logic.loadDashboard();

    expect(logic.state.reloadKey).toBeGreaterThan(first);
  });
});
