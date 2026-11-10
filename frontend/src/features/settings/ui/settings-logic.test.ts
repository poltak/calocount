import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../../core/tests/full-application.js";
import type { SettingsEvent } from "../types.js";
import { SettingsLogic } from "./settings-logic.js";

function setupTest() {
  return setupLogicTest({}, (app) => new SettingsLogic(app.frontend));
}

/** Open the dialog, change the form, and save it. */
async function saveWith(
  logic: SettingsLogic,
  change: (logic: SettingsLogic) => void,
) {
  await logic.open();
  change(logic);
  await logic.save();
}

describe("SettingsLogic tests", () => {
  it("should start with the dialog closed", async () => {
    const { logic } = await setupTest();

    expect(logic.state.isOpen).toEqual(false);
    expect(logic.state.draft).toEqual(null);
  });

  it("should open the dialog with the old defaults when nothing was saved", async () => {
    const { logic } = await setupTest();

    await logic.open();

    expect(logic.state.isOpen).toEqual(true);
    expect(logic.state.loadState).toEqual("success");
    expect(logic.state.draft).toMatchObject({
      calories: "2400",
      proteinG: "160",
      proteinGoalMode: "grams",
      proteinPerKg: "1.6",
      timezone: "UTC",
      vitaminB6UsFnbAdultUlEnabled: false,
      usFnbAdultUlEnabled: false,
    });
    expect(logic.state.draft?.nutrients.fiberG).toEqual("28");
    expect(logic.state.draft?.nutrients.totalSugarsG).toEqual("");
    expect(logic.state.draft?.nutrients.sodiumMg).toEqual("2300");
  });

  it("should close the dialog", async () => {
    const { logic } = await setupTest();
    await logic.open();

    logic.close();

    expect(logic.state.isOpen).toEqual(false);
  });

  it("should save the primary goals, close, and tell the dashboard", async () => {
    const { logic } = await setupTest();
    const events: SettingsEvent[] = [];
    logic.events.listen((event) => void events.push(event));

    await saveWith(logic, (form) => {
      form.changeDraft({ change: { calories: "2100", proteinG: "120" } });
    });

    expect(logic.state.saveState).toEqual("success");
    expect(logic.state.isOpen).toEqual(false);
    expect(events).toEqual([
      { type: "settingsSaved", message: "Targets saved." },
    ]);
    await logic.open();
    expect(logic.state.draft).toMatchObject({
      calories: "2100",
      proteinG: "120",
    });
  });

  it("should keep a custom nutrition goal and a goal that the owner turned off", async () => {
    const { logic } = await setupTest();

    await saveWith(logic, (form) => {
      form.changeNutrient({ key: "fiberG", value: "35" });
      form.changeNutrient({ key: "sodiumMg", value: "" });
    });

    await logic.open();
    expect(logic.state.draft?.nutrients.fiberG).toEqual("35");
    expect(logic.state.draft?.nutrients.sodiumMg).toEqual("");
    expect(logic.state.draft?.nutrients.ironMg).toEqual("18");
  });

  it("should restore every nutrition goal to its recommended default", async () => {
    const { logic } = await setupTest();
    await saveWith(logic, (form) => {
      form.changeNutrient({ key: "fiberG", value: "9" });
      form.changeNutrient({ key: "totalSugarsG", value: "50" });
    });
    await logic.open();

    logic.restoreRecommendedGoals();

    expect(logic.state.draft?.nutrients.fiberG).toEqual("28");
    expect(logic.state.draft?.nutrients.totalSugarsG).toEqual("");
    await logic.save();
    await logic.open();
    expect(logic.state.draft?.nutrients.fiberG).toEqual("28");
    expect(logic.state.draft?.nutrients.totalSugarsG).toEqual("");
  });

  it("should refuse a negative nutrition goal and keep the saved value", async () => {
    const { logic } = await setupTest();
    const events: SettingsEvent[] = [];
    logic.events.listen((event) => void events.push(event));

    await saveWith(logic, (form) => {
      form.changeNutrient({ key: "fiberG", value: "-3" });
    });

    expect(logic.state.saveState).toEqual("error");
    expect(logic.state.saveError).toEqual(
      "Nutrition goals must be greater than zero or left blank.",
    );
    expect(logic.state.isOpen).toEqual(true);
    expect(events).toEqual([]);
    await logic.open();
    expect(logic.state.draft?.nutrients.fiberG).toEqual("28");
  });

  it.each([
    [
      "calories",
      { calories: "0" },
      "Enter a calorie target greater than zero.",
    ],
    [
      "fixed protein",
      { proteinG: "" },
      "Enter a fixed protein target greater than zero.",
    ],
    [
      "protein per kilogram",
      { proteinGoalMode: "gramsPerKg" as const, proteinPerKg: "5" },
      "Enter a protein target between 0.8 and 3 g/kg.",
    ],
  ])(
    "should refuse %s that is out of range",
    async (_name, change, message) => {
      const { logic } = await setupTest();

      await saveWith(logic, (form) => form.changeDraft({ change }));

      expect(logic.state.saveError).toEqual(message);
      expect(logic.state.isOpen).toEqual(true);
    },
  );

  it("should keep the protein mode and the grams per kilogram", async () => {
    const { logic } = await setupTest();

    await saveWith(logic, (form) => {
      form.setProteinMode({ mode: "gramsPerKg" });
      form.changeDraft({ change: { proteinPerKg: "2" } });
    });

    await logic.open();
    expect(logic.state.draft).toMatchObject({
      proteinGoalMode: "gramsPerKg",
      proteinPerKg: "2",
    });
  });

  it("should keep the consent to the adult upper limits, and a withdrawal", async () => {
    const { logic } = await setupTest();

    await saveWith(logic, (form) =>
      form.changeDraft({
        change: {
          vitaminB6UsFnbAdultUlEnabled: true,
          usFnbAdultUlEnabled: true,
        },
      }),
    );
    await logic.open();
    expect(logic.state.draft).toMatchObject({
      vitaminB6UsFnbAdultUlEnabled: true,
      usFnbAdultUlEnabled: true,
    });

    logic.changeDraft({ change: { usFnbAdultUlEnabled: false } });
    await logic.save();
    await logic.open();
    expect(logic.state.draft).toMatchObject({
      vitaminB6UsFnbAdultUlEnabled: true,
      usFnbAdultUlEnabled: false,
    });
  });

  it("should keep a saved timezone, and use the timezone of the device", async () => {
    const { logic, frontend } = await setupTest();
    frontend.services.clock.useTimeZone("Europe/Berlin");

    await saveWith(logic, (form) =>
      form.changeDraft({ change: { timezone: "Asia/Tokyo" } }),
    );
    await logic.open();
    expect(logic.state.draft?.timezone).toEqual("Asia/Tokyo");

    logic.chooseDeviceTimeZone();
    expect(logic.state.draft?.timezone).toEqual("Europe/Berlin");
    await logic.save();
    await logic.open();
    expect(logic.state.draft?.timezone).toEqual("Europe/Berlin");
  });

  it("should show the message of the server when it refuses the settings", async () => {
    const { logic } = await setupTest();
    await logic.open();

    logic.changeDraft({ change: { timezone: "Not/AZone" } });
    await logic.save();

    expect(logic.state.saveState).toEqual("error");
    expect(logic.state.saveError).toEqual("Choose a valid timezone.");
    expect(logic.state.isOpen).toEqual(true);
  });
});
