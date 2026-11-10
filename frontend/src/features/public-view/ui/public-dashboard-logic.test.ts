import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import {
  DAY_MS,
  HOUR_MS,
  dateAgo,
  seedEntry,
  startOfToday,
  todayKey,
} from "../../entries/ui/entry-test-helpers.js";
import { PublicDashboardLogic } from "./public-dashboard-logic.js";

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

async function setupTest({
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
    return new PublicDashboardLogic(application.frontend);
  });
}

describe("PublicDashboardLogic tests", () => {
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

    expect(logic.state.loadState).toEqual("success");
    expect(logic.state.off).toEqual(false);
    expect(logic.state.today).toEqual(todayKey(app));
    expect(logic.state.selectedDate).toEqual(todayKey(app));
    expect(logic.state.timeZone).toEqual("UTC");
    expect(logic.state.calorieTarget).toEqual(2400);
    expect(logic.state.days).toHaveLength(7);
    expect(logic.state.days.at(-1)).toEqual({
      date: todayKey(app),
      mealCount: 1,
    });
    expect(logic.state.loadDayState).toEqual("success");
    expect(logic.state.entries).toMatchObject([
      { name: "Public oats", time: "08:00", calories: 300, protein: 12 },
    ]);
  });

  it("should show the times of the entries in the saved timezone of the owner", async () => {
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

  it("should say that the public view is off, and show nothing", async () => {
    const { logic } = await setupTest({
      publicView: false,
      seed: async (application) => {
        await seedEntry(application, { name: "Private lunch" });
      },
    });

    expect(logic.state.off).toEqual(true);
    expect(logic.state.entries).toEqual([]);
    expect(logic.state.loadError).toEqual(null);
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

    await logic.load();

    expect(logic.state.loadState).toEqual("error");
    expect(logic.state.loadError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
    expect(logic.state.selectedDate).toEqual(null);
    transport.goOnline();
    await logic.load();
    expect(logic.state.loadState).toEqual("success");
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
});
