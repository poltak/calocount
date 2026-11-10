import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { saveWeight } from "../../entries/ui/dashboard-test-setup.js";
import { seedEntry } from "../../entries/ui/entry-test-helpers.js";
import { CalendarLogic } from "./calendar-logic.js";

type Seed = (app: FullApplication) => Promise<void>;

/** A calendar on a database that `seed` fills first. */
function setupTest({
  seed,
  initialMonth = "2026-08",
  ...params
}: LogicTestParams & { seed?: Seed; initialMonth?: string } = {}) {
  return setupLogicTest(params, async (application) => {
    await seed?.(application);
    return new CalendarLogic({ ...application.frontend, initialMonth });
  });
}

const august = (day: number, hour = 12) => Date.UTC(2026, 7, day, hour);

const dayNumbers = (weeks: CalendarLogic["state"]["weeks"]) =>
  weeks.map((week) => week.map((cell) => cell?.dayOfMonth ?? null));

describe("CalendarLogic grid tests", () => {
  it("should start the weeks on Monday", async () => {
    // 1 September 2026 is a Tuesday.
    const { logic } = await setupTest({ initialMonth: "2026-09" });

    expect(dayNumbers(logic.state.weeks)).toEqual([
      [null, 1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12, 13],
      [14, 15, 16, 17, 18, 19, 20],
      [21, 22, 23, 24, 25, 26, 27],
      [28, 29, 30, null, null, null, null],
    ]);
    expect(logic.state.weeks[1]?.[5]?.date).toEqual("2026-09-12");
  });

  it("should have only the weeks that the days need", async () => {
    // February 2027 starts on a Monday and has 28 days.
    const february = await setupTest({ initialMonth: "2027-02" });
    expect(february.logic.state.weeks).toHaveLength(4);
    expect(dayNumbers(february.logic.state.weeks)[0]).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    // 1 August 2026 is a Saturday, so the month needs six weeks.
    const aug = await setupTest({ initialMonth: "2026-08" });
    expect(aug.logic.state.weeks).toHaveLength(6);
    expect(dayNumbers(aug.logic.state.weeks)[0]).toEqual([
      null,
      null,
      null,
      null,
      null,
      1,
      2,
    ]);
    expect(dayNumbers(aug.logic.state.weeks)[5]).toEqual([
      31,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("should have 29 days in February of a leap year", async () => {
    const { logic } = await setupTest({ initialMonth: "2028-02" });

    expect(logic.state.weeks.flat().filter(Boolean).at(-1)?.date).toEqual(
      "2028-02-29",
    );
  });
});

describe("CalendarLogic month tests", () => {
  it("should add up the complete entries of each day of the month", async () => {
    const { logic } = await setupTest({
      seed: async (app) => {
        await seedEntry(app, {
          calories: 500,
          proteinG: 30,
          consumedAt: august(3, 8),
        });
        await seedEntry(app, {
          calories: 700.4,
          proteinG: 45,
          consumedAt: august(3, 19),
        });
        await seedEntry(app, {
          calories: 400,
          proteinG: 20,
          consumedAt: august(20),
        });
        await seedEntry(app, {
          calories: 999,
          proteinG: 99,
          status: "pending",
          consumedAt: august(4),
        });
        await seedEntry(app, {
          calories: 111,
          consumedAt: Date.UTC(2026, 6, 31, 23),
        });
        await seedEntry(app, {
          calories: 222,
          consumedAt: Date.UTC(2026, 8, 1, 1),
        });
      },
    });

    await logic.refresh({ reloadKey: 1 });

    expect(logic.state.loadMonthState).toEqual("success");
    expect(logic.state.months["2026-08"]).toMatchObject({
      month: "2026-08",
      timezone: "UTC",
      firstDate: "2026-07-31",
      days: [
        { date: "2026-08-03", calories: 1200.4, proteinG: 75, mealCount: 2 },
        { date: "2026-08-20", calories: 400, proteinG: 20, mealCount: 1 },
      ],
    });
  });

  it("should count the days in the timezone of the device, also when summer time starts", async () => {
    const { logic } = await setupTest({
      initialMonth: "2026-03",
      seed: async (app) => {
        app.frontend.services.clock.useTimeZone("Europe/Berlin");
        // 23:30 UTC on 28 March is 00:30 on 29 March in Berlin.
        await seedEntry(app, {
          calories: 100,
          consumedAt: Date.UTC(2026, 2, 28, 23, 30),
        });
        // 22:30 UTC on 31 March is 00:30 on 1 April in Berlin, which is another month.
        await seedEntry(app, {
          calories: 200,
          consumedAt: Date.UTC(2026, 2, 31, 22, 30),
        });
      },
    });

    await logic.refresh({ reloadKey: 1 });

    const march = logic.state.months["2026-03"];
    expect(march?.timezone).toEqual("Europe/Berlin");
    expect(march?.days.map(({ date, calories }) => [date, calories])).toEqual([
      ["2026-03-29", 100],
    ]);
    await logic.showNextMonth();
    expect(
      logic.state.months["2026-04"]?.days.map(({ date, calories }) => [
        date,
        calories,
      ]),
    ).toEqual([["2026-04-01", 200]]);
  });

  it("should show an empty month, and no first day for an empty log", async () => {
    const { logic } = await setupTest();

    await logic.refresh({ reloadKey: 1 });

    expect(logic.state.months["2026-08"]).toMatchObject({
      days: [],
      firstDate: null,
    });
    expect(logic.state.loadMonthState).toEqual("success");
  });

  it("should start the log at the first weight when it is earlier than the first entry", async () => {
    const { logic } = await setupTest({
      seed: async (app) => {
        await seedEntry(app, { consumedAt: august(10) });
        await saveWeight(app, "2026-06-15", 70);
      },
    });

    await logic.refresh({ reloadKey: 1 });

    expect(logic.state.months["2026-08"]?.firstDate).toEqual("2026-06-15");
  });

  it("should read the previous and the next month when the owner moves", async () => {
    const { logic } = await setupTest({
      seed: async (app) => {
        await seedEntry(app, { calories: 300, consumedAt: august(5) });
        await seedEntry(app, {
          calories: 400,
          consumedAt: Date.UTC(2026, 6, 5),
        });
      },
    });
    await logic.refresh({ reloadKey: 1 });

    await logic.showPreviousMonth();

    expect(logic.state.month).toEqual("2026-07");
    expect(logic.state.weeks[0]?.find(Boolean)?.date).toEqual("2026-07-01");
    expect(logic.state.months["2026-07"]?.days).toMatchObject([
      { date: "2026-07-05", calories: 400 },
    ]);
    await logic.showNextMonth();
    expect(logic.state.month).toEqual("2026-08");
    expect(logic.state.months["2026-08"]?.days).toMatchObject([
      { date: "2026-08-05", calories: 300 },
    ]);
  });

  it("should read a month again only after the dashboard read again", async () => {
    const app = await setupTest();
    await app.logic.refresh({ reloadKey: 1 });
    await seedEntry(app, { calories: 300, consumedAt: august(5) });

    await app.logic.refresh({ reloadKey: 1 });
    expect(app.logic.state.months["2026-08"]?.days).toEqual([]);

    await app.logic.refresh({ reloadKey: 2 });
    expect(app.logic.state.months["2026-08"]?.days).toHaveLength(1);
  });

  it("should open months from the first entry to the current month, and the day in view", async () => {
    const { logic } = await setupTest({
      seed: async (app) => {
        await seedEntry(app, { consumedAt: Date.UTC(2026, 5, 20) });
      },
    });
    await logic.refresh({ reloadKey: 1 });

    expect(
      logic.monthBounds({ today: "2026-08-12", selectedDate: "2026-08-12" }),
    ).toEqual({ firstMonth: "2026-06", lastMonth: "2026-08" });
    // A day before the log starts can still be the day in view.
    expect(
      logic.monthBounds({ today: "2026-08-12", selectedDate: "2026-04-02" }),
    ).toEqual({ firstMonth: "2026-04", lastMonth: "2026-08" });
  });

  it("should say that a month cannot be read, and read it when the owner tries again", async () => {
    const { logic, transport } = await setupTest();
    transport.goOffline();

    await logic.refresh({ reloadKey: 1 });

    expect(logic.state.loadMonthState).toEqual("error");
    expect(logic.state.loadMonthError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
    expect(logic.state.months).toEqual({});
    transport.goOnline();
    await logic.loadMonth();
    expect(logic.state.loadMonthState).toEqual("success");
    expect(logic.state.loadMonthError).toEqual(null);
    expect(logic.state.months["2026-08"]).toBeDefined();
  });

  it("should say that a month cannot be read without a session", async () => {
    const { logic } = await setupTest({ authenticated: false });

    await logic.refresh({ reloadKey: 1 });

    expect(logic.state.loadMonthState).toEqual("error");
    expect(logic.state.loadMonthError).toEqual("Sign in to continue.");
  });
});
