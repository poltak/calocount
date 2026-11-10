import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../../core/tests/full-application.js";
import { dateAgo, todayKey } from "../../entries/ui/entry-test-helpers.js";
import type { WeightEvent } from "../types.js";
import { WeightLogic } from "./weight-logic.js";

function setupTest() {
  return setupLogicTest({}, (app) => new WeightLogic(app.frontend));
}

async function readDay(
  app: Awaited<ReturnType<typeof setupTest>>,
  date: string,
) {
  const response = await app.frontend.api.days[":date"].$get({
    param: { date },
    query: { timezone: "UTC" },
  });
  if (response.status !== 200) {
    throw new Error("The day was refused");
  }
  return response.json();
}

describe("WeightLogic tests", () => {
  it("should start the form empty for a day without a weight", async () => {
    const { logic } = await setupTest();

    logic.openForm({ current: null });

    expect(logic.state.draft).toEqual("");
  });

  it("should start the form with the weight of the day", async () => {
    const { logic } = await setupTest();

    logic.openForm({ current: 71.4 });

    expect(logic.state.draft).toEqual("71.4");
  });

  it("should save the weight of a day, close the form, and tell the dashboard", async () => {
    const app = await setupTest();
    const { logic } = app;
    const events: WeightEvent[] = [];
    logic.events.listen((event) => void events.push(event));
    logic.openForm({ current: null });
    logic.changeDraft({ value: "71.4" });

    await logic.save({ date: todayKey(app) });

    expect(logic.state.saveState).toEqual("success");
    expect(logic.state.draft).toEqual(null);
    expect(events).toEqual([{ type: "weightSaved", message: "Weight saved." }]);
    const day = await readDay(app, todayKey(app));
    expect(day.weight).toMatchObject({
      weightKg: 71.4,
      logicalDate: todayKey(app),
    });
    expect(day.weight?.recordedAt).toBeGreaterThan(0);
  });

  it("should change the weight of an earlier day and leave the other days alone", async () => {
    const app = await setupTest();
    const { logic } = app;
    const earlier = dateAgo(app, 1);
    logic.openForm({ current: null });
    logic.changeDraft({ value: "70" });
    await logic.save({ date: earlier });
    logic.openForm({ current: 70 });
    logic.changeDraft({ value: "72" });

    await logic.save({ date: earlier });

    expect((await readDay(app, earlier)).weight?.weightKg).toEqual(72);
    expect((await readDay(app, todayKey(app))).weight).toEqual(null);
  });

  it.each(["", "0", "0.5", "1001", "abc"])(
    "should refuse the weight %j and keep the form open",
    async (value) => {
      const app = await setupTest();
      const { logic } = app;
      const events: WeightEvent[] = [];
      logic.events.listen((event) => void events.push(event));
      logic.openForm({ current: null });
      logic.changeDraft({ value });

      await logic.save({ date: todayKey(app) });

      expect(logic.state.saveState).toEqual("error");
      expect(logic.state.saveError).toEqual(
        "Enter a weight between 1 and 1,000 kg.",
      );
      expect(logic.state.draft).toEqual(value);
      expect(events).toEqual([]);
      expect((await readDay(app, todayKey(app))).weight).toEqual(null);
    },
  );

  it("should show the message of the server when it refuses the date", async () => {
    const { logic } = await setupTest();
    logic.openForm({ current: null });
    logic.changeDraft({ value: "70" });

    await logic.save({ date: "2026-02-31" });

    expect(logic.state.saveState).toEqual("error");
    expect(logic.state.saveError).toEqual(
      "The date must be a valid YYYY-MM-DD date.",
    );
  });

  it("should be busy only while the weight saves", async () => {
    const app = await setupTest();
    const { logic } = app;
    logic.openForm({ current: null });
    logic.changeDraft({ value: "70" });
    expect(logic.busy).toEqual(false);

    const saving = logic.save({ date: todayKey(app) });
    expect(logic.busy).toEqual(true);
    await saving;

    expect(logic.busy).toEqual(false);
  });

  it("should close the form without a save", async () => {
    const { logic } = await setupTest();
    logic.openForm({ current: 70 });

    logic.closeForm();

    expect(logic.state.draft).toEqual(null);
  });
});
