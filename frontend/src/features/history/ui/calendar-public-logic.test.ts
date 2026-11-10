import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
} from "../../core/tests/full-application.js";
import { seedEntry } from "../../entries/ui/entry-test-helpers.js";
import { CalendarLogic } from "./calendar-logic.js";

const august = (day: number, hour = 12) => Date.UTC(2026, 7, day, hour);

function setupTest({
  publicView,
  seed,
}: {
  publicView: boolean;
  seed?: (app: FullApplication) => Promise<void>;
}) {
  return setupLogicTest({}, async (application) => {
    const response = await application.frontend.api.settings.$patch({
      json: { publicViewEnabled: publicView },
    });
    if (response.status !== 200) {
      throw new Error(`The settings were refused: ${response.status}`);
    }
    await seed?.(application);
    return new CalendarLogic({
      ...application.frontend,
      initialMonth: "2026-08",
      source: "public",
    });
  });
}

describe("CalendarLogic public month tests", () => {
  it("should read the totals of each day from the public month view", async () => {
    const { logic } = await setupTest({
      publicView: true,
      seed: async (app) => {
        await seedEntry(app, {
          calories: 500,
          proteinG: 30,
          consumedAt: august(3, 8),
        });
        await seedEntry(app, { calories: 400, consumedAt: august(20) });
      },
    });

    await logic.refresh({ reloadKey: 0 });

    expect(logic.state.loadMonthState).toEqual("success");
    expect(logic.state.months["2026-08"]).toMatchObject({
      month: "2026-08",
      timezone: "UTC",
      firstDate: "2026-08-03",
      days: [
        { date: "2026-08-03", calories: 500, proteinG: 30, mealCount: 1 },
        { date: "2026-08-20", calories: 400, mealCount: 1 },
      ],
    });
  });

  it("should say that the month cannot be read while the public view is off", async () => {
    const { logic } = await setupTest({ publicView: false });

    await logic.refresh({ reloadKey: 0 });

    expect(logic.state.loadMonthState).toEqual("error");
    expect(logic.state.months["2026-08"]).toEqual(undefined);
  });
});
