import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import {
  HOUR_MS,
  dateAgo,
  pngFile,
  seedEntry,
  startOfToday,
  todayKey,
} from "../../entries/ui/entry-test-helpers.js";
import { PublicDashboardLogic } from "./public-dashboard-logic.js";

async function setupTest({
  seed,
  ...params
}: LogicTestParams & {
  seed?: (app: FullApplication) => Promise<void>;
} = {}) {
  return setupLogicTest(params, async (application) => {
    const response = await application.frontend.api.settings.$patch({
      json: { publicViewEnabled: true },
    });
    if (response.status !== 200) {
      throw new Error(`The settings were refused: ${response.status}`);
    }
    await seed?.(application);
    return new PublicDashboardLogic(application.frontend);
  });
}

describe("PublicDashboardLogic calendar tests", () => {
  it("should open the calendar on the month of the day in view and close it", async () => {
    const { logic, ...app } = await setupTest();

    logic.toggleCalendar();

    expect(logic.state.showCalendar).toEqual(true);
    expect(logic.state.calendarMonth).toEqual(todayKey(app).slice(0, 7));
    logic.toggleCalendar();
    expect(logic.state.showCalendar).toEqual(false);
    expect(logic.state.calendarMonth).toEqual(null);
  });

  it("should show a day that the calendar selects and close the calendar", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, {
          name: "Old supper",
          consumedAt:
            startOfToday(application) - 20 * 86_400_000 + HOUR_MS * 19,
        });
      },
    });
    logic.toggleCalendar();

    await logic.selectCalendarDate({ date: dateAgo(app, 20) });

    expect(logic.state.showCalendar).toEqual(false);
    expect(logic.state.selectedDate).toEqual(dateAgo(app, 20));
    expect(logic.state.entries).toMatchObject([{ name: "Old supper" }]);
  });
});

describe("PublicDashboardLogic photo tests", () => {
  it("should give an entry with a photo the address of the public photo route", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, { name: "Photo oats", photo: pngFile() });
        await seedEntry(application, { name: "Plain oats" });
      },
    });
    const withPhoto = logic.state.entries.find(
      (entry) => entry.name === "Photo oats",
    );
    const without = logic.state.entries.find(
      (entry) => entry.name === "Plain oats",
    );

    expect(withPhoto?.hasPhoto).toEqual(true);
    expect(logic.shownPhotoUrl({ entry: withPhoto! })).toMatch(
      new RegExp(`/meal-photos/${withPhoto?.id}$`, "u"),
    );
    expect(without?.hasPhoto).toEqual(false);
    expect(logic.shownPhotoUrl({ entry: without! })).toEqual(null);
  });

  it("should open the large view, close it, and drop a photo that fails to load", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedEntry(application, { name: "Photo oats", photo: pngFile() });
      },
    });
    const [entry] = logic.state.entries;
    if (!entry) {
      throw new Error("The seed entry is missing.");
    }

    logic.openPhoto({ entry });
    expect(logic.state.previewEntry).toEqual(entry);
    logic.closePhoto();
    expect(logic.state.previewEntry).toEqual(null);
    logic.markPhotoFailed({ entry });
    logic.markPhotoFailed({ entry });

    expect(logic.state.failedPhotoIds).toEqual([entry.id]);
    expect(logic.shownPhotoUrl({ entry })).toEqual(null);
  });
});
