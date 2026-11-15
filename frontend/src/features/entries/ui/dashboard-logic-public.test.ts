import { describe, expect, it, vi } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { DashboardLogic } from "./dashboard-logic.js";
import {
  DAY_MS,
  HOUR_MS,
  dateAgo,
  pngFile,
  seedEntry,
  startOfToday,
  todayKey,
} from "./entry-test-helpers.js";

/** Save settings through the API, as the owner's dialog does. */
async function saveSettings(
  { frontend }: Pick<FullApplication, "frontend">,
  json: { publicViewEnabled?: boolean; timezone?: string },
) {
  const response = await frontend.api.settings.$patch({ json });
  if (response.status !== 200) {
    throw new Error(`The settings were refused: ${response.status}`);
  }
}

/** The dashboard of a visitor, on a database that `seed` fills first. */
function setupTest({
  publicView = true,
  seed,
  ...params
}: LogicTestParams & {
  publicView?: boolean;
  seed?: (app: FullApplication) => Promise<void>;
} = {}) {
  return setupLogicTest(params, async (application) => {
    await saveSettings(application, { publicViewEnabled: publicView });
    await seed?.(application);
    return new DashboardLogic({
      ...application.frontend,
      audience: "public",
      entryEvents: [],
      settingsEvents: [],
      weightEvents: [],
    });
  });
}

describe("DashboardLogic public read tests", () => {
  it("should read today, the targets, the recent days and the entries of today", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, {
          name: "Public oats",
          calories: 300,
          proteinG: 12,
          consumedAt: startOfToday(application) + 8 * HOUR_MS,
        });
      },
    });

    expect(logic.state.loadDashboardState).toEqual("success");
    expect(logic.state.publicViewOff).toEqual(false);
    expect(logic.state.today).toEqual(todayKey(app));
    expect(logic.state.selectedDate).toEqual(todayKey(app));
    expect(logic.state.timeZone).toEqual("UTC");
    expect(logic.state.targets.calories).toEqual(2400);
    expect(logic.state.days).toHaveLength(7);
    expect(logic.state.days.at(-1)).toMatchObject({
      date: todayKey(app),
      mealCount: 1,
    });
    expect(logic.state.loadDayState).toEqual("success");
    expect(logic.state.entries).toMatchObject([
      { name: "Public oats", time: "08:00", calories: 300, protein: 12 },
    ]);
  });

  it("should show the entries in the saved timezone of the owner", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await saveSettings(application, { timezone: "Asia/Tokyo" });
        await seedEntry(application, {
          name: "Pho",
          consumedAt: startOfToday(application) + 12 * HOUR_MS,
        });
      },
    });

    expect(logic.state.timeZone).toEqual("Asia/Tokyo");
    // 12:00 UTC is 21:00 in Tokyo.
    expect(logic.state.entries).toMatchObject([{ name: "Pho", time: "21:00" }]);
  });

  it("should show no caption, no notes and no saved entries of the owner", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, {
          name: "Soup",
          caption: "Secret caption",
        });
      },
    });

    expect(logic.state.entries).toMatchObject([
      { name: "Soup", description: "Soup", savedEntryId: null, photoKey: null },
    ]);
    expect(logic.state.savedEntries).toEqual([]);
  });

  it("should say that the public view is off, and show nothing", async () => {
    const { logic } = await setupTest({
      publicView: false,
      seed: async (application) => {
        await seedEntry(application, { name: "Private lunch" });
      },
    });

    expect(logic.state.publicViewOff).toEqual(true);
    expect(logic.state.entries).toEqual([]);
    expect(logic.state.loadDashboardError).toEqual(null);
  });

  it("should show the entries of an older day and step with the arrows", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, {
          name: "Older supper",
          consumedAt: startOfToday(application) - DAY_MS + 19 * HOUR_MS,
        });
      },
    });
    expect(logic.state.entries).toEqual([]);

    await logic.goToPreviousDay();

    expect(logic.state.selectedDate).toEqual(dateAgo(app, 1));
    expect(logic.state.entries).toMatchObject([{ name: "Older supper" }]);
    await logic.goToNextDay();
    expect(logic.state.selectedDate).toEqual(todayKey(app));
    expect(logic.state.entries).toEqual([]);
  });

  it("should refuse a date in the future, or a text that is not a date", async () => {
    const { logic, ...app } = await setupTest();

    await logic.selectDate({ date: "2999-01-01" });
    await logic.selectDate({ date: "tomorrow" });
    await logic.goToNextDay();

    expect(logic.state.selectedDate).toEqual(todayKey(app));
  });

  it("should say that the page cannot be read without a connection", async () => {
    const { logic, transport } = await setupTest({ skipInitialization: true });
    transport.goOffline();

    await logic.loadDashboard();

    expect(logic.state.loadDashboardState).toEqual("error");
    expect(logic.state.loadDashboardError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
    expect(logic.state.loaded).toEqual(false);
    expect(logic.state.selectedDate).toEqual(null);
    transport.goOnline();
    await logic.loadDashboard();
    expect(logic.state.loadDashboardState).toEqual("success");
  });

  it("should say that a day cannot be read, and keep the day in view", async () => {
    const { logic, transport, ...app } = await setupTest();
    transport.goOffline();

    await logic.goToPreviousDay();

    expect(logic.state.loadDayState).toEqual("error");
    expect(logic.state.loadDayError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
    expect(logic.state.selectedDate).toEqual(dateAgo(app, 1));
  });

  it("should do nothing with the arrows before the first read", async () => {
    const { logic } = await setupTest({ skipInitialization: true });

    await logic.goToPreviousDay();
    await logic.goToNextDay();

    expect(logic.state.selectedDate).toEqual(null);
    expect(logic.state.loadDayState).toEqual("pristine");
  });

  it("should mark an entry with a photo, and an entry without one", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, { name: "Photo oats", photo: pngFile() });
        await seedEntry(application, { name: "Plain oats" });
      },
    });

    expect(
      logic.state.entries.map(({ name, publicPhoto }) => [name, publicPhoto]),
    ).toEqual(
      expect.arrayContaining([
        ["Photo oats", true],
        ["Plain oats", false],
      ]),
    );
  });
});

describe("DashboardLogic time zone notice tests", () => {
  it("should name the saved timezone when the device is in another one", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await saveSettings(application, { timezone: "America/Los_Angeles" });
      },
    });

    expect(logic.timeZoneNotice).toEqual(
      "Days and times are shown in America/Los Angeles time.",
    );
  });

  it("should give no notice when the saved timezone is the one of the device", async () => {
    const { logic } = await setupTest();

    expect(logic.state.timeZone).toEqual("UTC");
    expect(logic.timeZoneNotice).toBeNull();
  });

  it("should read again after midnight in the timezone of the owner, not the timezone of the device", async () => {
    const { logic, ...app } = await setupTest();
    const reads = logic.state.reloadKey;
    app.frontend.services.clock.useTimeZone("Pacific/Auckland");

    app.frontend.services.ticker.tick();
    expect(logic.state.reloadKey).toEqual(reads);

    app.frontend.services.clock.advance(DAY_MS);
    app.backend.services.clock.advance(DAY_MS);
    app.frontend.services.ticker.tick();

    await vi.waitFor(() => expect(logic.state.today).toEqual(todayKey(app)));
    expect(logic.state.reloadKey).toBeGreaterThan(reads);
  });
});
