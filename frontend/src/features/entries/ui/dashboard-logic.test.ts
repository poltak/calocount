import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../types.js";
import { DashboardLogic } from "./dashboard-logic.js";
import type { Seed } from "./dashboard-test-setup.js";
import { describe, expect, it, vi } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  dateAgo,
  seedEntry,
  startOfToday,
  todayKey,
} from "./entry-test-helpers.js";

/** A dashboard on a database that `seed` fills first. `events` stands in for the Logic classes that change entries. */
async function setupTest({
  seed,
  ...params
}: LogicTestParams & { seed?: Seed } = {}) {
  const events = new EventEmitter<EntryEvent>();
  const app = await setupLogicTest(params, async (application) => {
    await seed?.(application);
    return new DashboardLogic({
      ...application.frontend,
      entryEvents: [events],
      settingsEvents: [],
      weightEvents: [],
    });
  });
  return { ...app, events };
}

/** Move the clock of the backend to an hour of today, to test the day's end. */
function moveBackendClockToHour(app: FullApplication, hour: number) {
  const target = startOfToday(app) + hour * HOUR_MS + 30 * 60_000;
  app.backend.services.clock.advance(target - app.backend.services.clock.now());
}

describe("DashboardLogic read tests", () => {
  it("should read today, the goals, the recent days and the entries of today", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, {
          name: "Oats",
          calories: 300,
          proteinG: 10,
          consumedAt: startOfToday(application) + 8 * HOUR_MS,
        });
      },
    });

    expect(logic.state.loadDashboardState).toEqual("success");
    expect(logic.state.loaded).toEqual(true);
    expect(logic.state.today).toEqual(todayKey(app));
    expect(logic.state.selectedDate).toEqual(todayKey(app));
    expect(logic.state.timeZone).toEqual("UTC");
    expect(logic.state.targets).toMatchObject({
      calories: 2400,
      proteinG: 160,
    });
    expect(logic.state.proteinGoal).toMatchObject({ targetG: 160 });
    expect(logic.state.days).toHaveLength(7);
    expect(logic.state.days.at(-1)).toMatchObject({
      date: todayKey(app),
      calories: 300,
      proteinG: 10,
      mealCount: 1,
    });
    expect(logic.state.loadDayState).toEqual("success");
    expect(logic.state.entries).toMatchObject([
      { name: "Oats", time: "08:00", calories: 300, protein: 10 },
    ]);
    expect(logic.state.savedEntries).toEqual([]);
  });

  it("should list the entries of a day newest first", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        const start = startOfToday(application);
        await seedEntry(application, {
          name: "Lunch",
          consumedAt: start + 12 * HOUR_MS,
        });
        await seedEntry(application, {
          name: "Breakfast",
          consumedAt: start + 8 * HOUR_MS,
        });
        await seedEntry(application, {
          name: "Dinner",
          consumedAt: start + 19 * HOUR_MS,
        });
      },
    });

    expect(logic.state.entries.map(({ name }) => name)).toEqual([
      "Dinner",
      "Lunch",
      "Breakfast",
    ]);
  });

  it("should name an entry by its first item, its caption, or its type", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        const start = startOfToday(application);
        await seedEntry(application, {
          caption: "Soup, bread",
          items: [],
          consumedAt: start + 3 * HOUR_MS,
        });
        await seedEntry(application, {
          mealType: "lunch",
          items: [],
          consumedAt: start + 2 * HOUR_MS,
        });
        await seedEntry(application, {
          items: [],
          consumedAt: start + HOUR_MS,
        });
      },
    });

    expect(
      logic.state.entries.map(({ name, description }) => [name, description]),
    ).toEqual([
      ["Soup", "Soup, bread"],
      ["Lunch entry", "Logged from dashboard"],
      ["Entry", "Logged from dashboard"],
    ]);
  });

  it("should count only complete entries in the totals of the recent days", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, { calories: 300 });
        await seedEntry(application, { calories: 500, status: "pending" });
      },
    });

    expect(logic.state.days.at(-1)).toMatchObject({
      calories: 300,
      mealCount: 1,
    });
    expect(logic.state.entries).toHaveLength(2);
  });

  it("should total a nutrient over the items that have a value, and count the others as unknown", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, {
          items: [{ name: "Bran", fiberG: 5, sodiumMg: 0 }, { name: "Milk" }],
        });
      },
    });

    const today = logic.state.days.at(-1);
    expect(today?.nutrients.fiberG).toEqual({
      amount: 5,
      knownItemCount: 1,
      totalItemCount: 2,
      complete: false,
    });
    expect(today?.nutrients.sodiumMg.amount).toEqual(0);
    expect(today?.nutrients.calciumMg.amount).toEqual(null);
  });

  it("should total a day of more than 500 entries", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        const start = startOfToday(application);
        for (let batch = 0; batch < 11; batch += 1) {
          await Promise.all(
            Array.from({ length: 50 }, (_, index) =>
              seedEntry(application, {
                name: `Snack ${batch * 50 + index}`,
                calories: 2,
                consumedAt: start + 6 * HOUR_MS,
              }),
            ),
          );
        }
      },
    });

    expect(logic.state.entries).toHaveLength(550);
    expect(logic.state.days.at(-1)).toMatchObject({
      calories: 1100,
      mealCount: 550,
    });
  }, 60_000);

  it("should leave out today from the average until the evening", async () => {
    const app = await setupTest({
      seed: async (application) => {
        moveBackendClockToHour(application, 10);
        const start = startOfToday(application);
        await seedEntry(application, {
          calories: 600,
          consumedAt: start - 12 * HOUR_MS,
        });
        await seedEntry(application, { calories: 300, consumedAt: start });
      },
    });

    expect(app.logic.state.averageCalories).toEqual(100);

    moveBackendClockToHour(app, 22);
    await app.logic.loadDashboard();

    expect(app.logic.state.averageCalories).toBeCloseTo(900 / 7);
  });

  it("should count the days in the timezone of the device", async () => {
    const { frontend, logic } = await setupTest({
      seed: async (application) => {
        application.frontend.services.clock.useTimeZone("Europe/Berlin");
        // 28 March 23:30 UTC is 00:30 on 29 March in Berlin, and 29 March
        // 21:30 UTC is 23:30. The day is 23 hours long, as summer time starts.
        await seedEntry(application, {
          name: "After midnight",
          consumedAt: Date.UTC(2026, 2, 28, 23, 30),
        });
        await seedEntry(application, {
          name: "Before midnight",
          consumedAt: Date.UTC(2026, 2, 29, 21, 30),
        });
        await seedEntry(application, {
          name: "Next day",
          consumedAt: Date.UTC(2026, 2, 29, 22, 30),
        });
      },
    });

    await logic.selectDate({ date: "2026-03-29" });

    expect(frontend.services.clock.timeZone()).toEqual("Europe/Berlin");
    expect(logic.state.timeZone).toEqual("Europe/Berlin");
    expect(logic.state.entries.map(({ name, time }) => [name, time])).toEqual([
      ["Before midnight", "23:30"],
      ["After midnight", "00:30"],
    ]);
  });

  it("should say that the dashboard cannot be read without a session", async () => {
    const { logic } = await setupTest({ authenticated: false });

    expect(logic.state.loaded).toEqual(false);
    expect(logic.state.loadDashboardState).toEqual("error");
    expect(logic.state.loadDashboardError).toEqual("Sign in to continue.");
  });

  it("should keep what it shows when a later read fails", async () => {
    const { logic, transport } = await setupTest();

    transport.goOffline();
    await logic.loadDashboard();

    expect(logic.state.loaded).toEqual(true);
    expect(logic.state.loadDashboardState).toEqual("error");
    expect(logic.state.loadDashboardError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
    transport.goOnline();
    await logic.loadDashboard();
    expect(logic.state.loadDashboardState).toEqual("success");
    expect(logic.state.loadDashboardError).toEqual(null);
  });

  it("should read again when the window gets the focus, as on a new day", async () => {
    const { frontend, logic } = await setupTest();
    expect(logic.state.entries).toEqual([]);
    await seedEntry({ frontend }, { name: "Late snack" });

    frontend.services.windowFocus.focus();

    await vi.waitFor(() =>
      expect(logic.state.entries.map(({ name }) => name)).toEqual([
        "Late snack",
      ]),
    );
  });
});

describe("DashboardLogic day tests", () => {
  it("should show the entries of an older day, and clear the confirmation", async () => {
    const { events, logic, ...app } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, {
          name: "Yesterday soup",
          consumedAt: startOfToday(application) - 12 * HOUR_MS,
        });
        await seedEntry(application, { name: "Oats" });
      },
    });
    await events.emit({ type: "savedEntriesChanged", message: "Saved." });
    expect(logic.state.statusMessage).toEqual("Saved.");

    const selectP = logic.selectDate({ date: dateAgo(app, 1) });
    expect(logic.state.selectedDate).toEqual(dateAgo(app, 1));
    expect(logic.state.entries).toEqual([]);
    await selectP;

    expect(logic.state.loadDayState).toEqual("success");
    expect(logic.state.statusMessage).toEqual(null);
    expect(logic.state.entries.map(({ name }) => name)).toEqual([
      "Yesterday soup",
    ]);
  });

  it("should step with the day arrows, and stop at today", async () => {
    const { logic, ...app } = await setupTest();

    await logic.goToPreviousDay();
    await logic.goToPreviousDay();
    expect(logic.state.selectedDate).toEqual(dateAgo(app, 2));

    await logic.goToNextDay();
    await logic.goToNextDay();
    await logic.goToNextDay();
    expect(logic.state.selectedDate).toEqual(todayKey(app));
  });

  it("should refuse a date in the future, or a text that is not a date", async () => {
    const { logic, ...app } = await setupTest();

    await logic.selectDate({
      date: new Date(startOfToday(app) + DAY_MS).toISOString().slice(0, 10),
    });
    await logic.selectDate({ date: "next week" });
    await logic.selectDate({ date: todayKey(app) });

    expect(logic.state.selectedDate).toEqual(todayKey(app));
    expect(logic.state.loadDayState).toEqual("success");
  });

  it("should do nothing with the day arrows or the date before the first read", async () => {
    const { logic } = await setupTest({
      skipInitialization: true,
      authenticated: false,
    });

    await logic.goToPreviousDay();
    await logic.goToNextDay();
    await logic.selectDate({ date: "2026-01-01" });

    expect(logic.state.selectedDate).toEqual(null);
    expect(logic.state.loadDayState).toEqual("pristine");
  });

  it("should show the day that the owner chose last, when an earlier read is slow", async () => {
    const { logic, transport, ...app } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, {
          name: "Two days ago",
          consumedAt: startOfToday(application) - 36 * HOUR_MS,
        });
        await seedEntry(application, {
          name: "Yesterday soup",
          consumedAt: startOfToday(application) - 12 * HOUR_MS,
        });
      },
    });
    const slow = transport.holdNextRequest();
    const first = logic.selectDate({ date: dateAgo(app, 2) });
    await slow.reached;

    await logic.selectDate({ date: dateAgo(app, 1) });
    slow.release();
    await first;

    expect(logic.state.selectedDate).toEqual(dateAgo(app, 1));
    expect(logic.state.entries.map(({ name }) => name)).toEqual([
      "Yesterday soup",
    ]);
  });

  it("should say that a day cannot be read, and keep the day in view", async () => {
    const { logic, transport, ...app } = await setupTest();

    transport.goOffline();
    await logic.selectDate({ date: dateAgo(app, 1) });

    expect(logic.state.selectedDate).toEqual(dateAgo(app, 1));
    expect(logic.state.loadDayState).toEqual("error");
    expect(logic.state.loadDayError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
  });
});

describe("DashboardLogic change tests", () => {
  it("should read again after a change, and show its confirmation", async () => {
    const { events, frontend, logic } = await setupTest();
    await seedEntry({ frontend }, { name: "Apple", calories: 95 });

    await events.emit({ type: "entriesChanged", message: "Entry added." });

    expect(logic.state.statusMessage).toEqual("Entry added.");
    expect(logic.state.entries.map(({ name }) => name)).toEqual(["Apple"]);
    expect(logic.state.days.at(-1)?.calories).toEqual(95);
  });

  it("should move to the day of a change, as when a saved entry is tracked", async () => {
    const { events, logic, ...app } = await setupTest();
    await logic.selectDate({ date: dateAgo(app, 1) });

    await events.emit({
      type: "entriesChanged",
      message: "Tracked “Oats”.",
      date: todayKey(app),
    });

    expect(logic.state.selectedDate).toEqual(todayKey(app));
  });

  it("should read the saved entries again after a change to them", async () => {
    const { events, frontend, logic } = await setupTest();
    const mealId = await seedEntry({ frontend }, { name: "Granola" });
    await frontend.api["saved-entries"].$post({
      json: { sourceEntryId: mealId },
    });

    await events.emit({
      type: "savedEntriesChanged",
      message: "Added to saved entries.",
    });

    expect(logic.state.savedEntries).toMatchObject([
      { sourceEntryId: mealId, totalCalories: 300 },
    ]);
  });

  it("should keep the day in view after a read, and move the view that showed an old today", async () => {
    const { events, logic, ...app } = await setupTest();
    await logic.selectDate({ date: dateAgo(app, 2) });

    await events.emit({ type: "entriesChanged", message: "Entry saved." });

    expect(logic.state.selectedDate).toEqual(dateAgo(app, 2));
  });
});

describe("DashboardLogic view tests", () => {
  it("should remember that the owner folded the nutrition section", async () => {
    const { frontend, logic } = await setupTest();
    const { browserStorage } = frontend;
    expect(logic.state.nutritionCollapsed).toEqual(false);

    logic.toggleNutritionSection();

    expect(logic.state.nutritionCollapsed).toEqual(true);
    expect(browserStorage.getItem("calocount:nutrition-collapsed")).toEqual(
      "true",
    );
    const later = new DashboardLogic({
      ...frontend,
      entryEvents: [],
      settingsEvents: [],
      weightEvents: [],
    });
    await later.initialize();
    expect(later.state.nutritionCollapsed).toEqual(true);
    await later.cleanup();

    logic.toggleNutritionSection();
    expect(logic.state.nutritionCollapsed).toEqual(false);
    expect(browserStorage.getItem("calocount:nutrition-collapsed")).toEqual(
      "false",
    );
  });

  it("should open and close the nutrition details of an entry", async () => {
    const { logic } = await setupTest();

    logic.toggleNutritionDetails({ entryId: "a" });
    logic.toggleNutritionDetails({ entryId: "b" });
    expect(logic.state.openDetailIds).toEqual(["a", "b"]);

    logic.toggleNutritionDetails({ entryId: "a" });
    expect(logic.state.openDetailIds).toEqual(["b"]);
  });

  it("should pick the nutrient of the trend", async () => {
    const { logic } = await setupTest();
    expect(logic.state.trendNutrient).toEqual("fiberG");

    logic.setTrendNutrient({ key: "sodiumMg" });

    expect(logic.state.trendNutrient).toEqual("sodiumMg");
  });

  it("should follow the address of the page to the active section", async () => {
    const { logic } = await setupTest();
    expect(logic.state.activeSection).toEqual("today");

    logic.setActiveSection({ hash: "#meals" });
    expect(logic.state.activeSection).toEqual("meals");

    logic.setActiveSection({ hash: "#nutrition" });
    expect(logic.state.activeSection).toEqual("nutrition");

    logic.setActiveSection({ hash: "#somewhere-else" });
    expect(logic.state.activeSection).toEqual("today");
  });
});
