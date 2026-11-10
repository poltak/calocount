import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { describe, expect, it, vi } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryEvent } from "../../entries/types.js";
import type { SettingsEvent } from "../../settings/types.js";
import type { WeightEvent } from "../../weights/types.js";
import {
  dateAgo,
  patchSettings,
  saveWeight,
  seedDay,
  today,
} from "./insight-test-helpers.js";
import { InsightsLogic } from "./insights-logic.js";

type Seed = (app: FullApplication) => Promise<void>;

/** The insights on a database that `seed` fills first. `events` stands in for the Logic classes that change entries. */
async function setupTest({
  seed,
  ...params
}: LogicTestParams & { seed?: Seed } = {}) {
  const events = new EventEmitter<EntryEvent>();
  const settingsEvents = new EventEmitter<SettingsEvent>();
  const weightEvents = new EventEmitter<WeightEvent>();
  const app = await setupLogicTest(params, async (application) => {
    await seed?.(application);
    return new InsightsLogic({
      ...application.frontend,
      entryEvents: [events],
      settingsEvents: [settingsEvents],
      weightEvents: [weightEvents],
    });
  });
  return { ...app, events, settingsEvents, weightEvents };
}

describe("InsightsLogic read tests", () => {
  it("should read 30 finished days and today with their totals", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: today(application),
          items: [{ name: "Oats", calories: 400, proteinG: 20, fiberG: 4 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "Eggs", calories: 300, proteinG: 15 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 30),
          items: [{ name: "First day", calories: 100 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 31),
          items: [{ name: "Too old", calories: 100 }],
        });
      },
    });

    expect(logic.state.loadState).toEqual("success");
    expect(logic.state.loaded).toEqual(true);
    expect(logic.state.today).toEqual(today(app));
    expect(logic.state.days).toHaveLength(31);
    expect(logic.state.days[0]?.date).toEqual(dateAgo(app, 30));
    expect(logic.state.days.at(-1)).toMatchObject({
      date: today(app),
      calories: 400,
      proteinG: 20,
      mealCount: 1,
    });
    expect(logic.state.days.at(-1)?.nutrients.fiberG.amount).toEqual(4);
    expect(logic.state.days.at(-2)?.nutrients.fiberG.amount).toEqual(null);
    expect(
      logic.state.entries.map((entry) => entry.items[0]?.name).toSorted(),
    ).toEqual(["Eggs", "First day", "Oats"]);
    expect(logic.state.calorieTarget).toEqual(2400);
    expect(logic.state.proteinTargets).toHaveLength(31);
    expect(logic.state.proteinTargets.at(-1)).toEqual({
      date: today(app),
      targetG: 160,
    });
  });

  it("should leave out pending entries", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 1),
          status: "pending",
          items: [{ name: "Pending soup", calories: 100 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "Done soup", calories: 200 }],
        });
      },
    });

    expect(logic.state.entries).toHaveLength(1);
    expect(logic.state.days.at(-2)).toMatchObject({
      calories: 200,
      mealCount: 1,
    });
  });

  it("should count the days in the timezone of the device", async () => {
    const { logic } = await setupTest({
      seed: async (application) => {
        application.frontend.services.clock.useTimeZone("Asia/Ho_Chi_Minh");
        // 18:30 UTC of the day before yesterday is 01:30 of yesterday in Vietnam.
        const date = dateAgo(application, 2);
        await application.frontend.api.meals.$post({
          json: {
            consumedAt: Date.parse(`${date}T18:30:00Z`),
            caption: "",
            items: [{ name: "Tea", calories: 0 }],
          },
        });
      },
    });

    expect(logic.state.entries[0]?.date).toEqual(
      new Date(Date.parse(`${logic.state.today}T00:00:00Z`) - 86_400_000)
        .toISOString()
        .slice(0, 10),
    );
  });

  it("should replace edited and deleted dates and keep older history", async () => {
    const { logic, events, frontend, ...app } = await setupTest({
      seed: async (application) => {
        await seedDay(application, {
          date: dateAgo(application, 20),
          items: [{ name: "Old coffee", calories: 100 }],
        });
        await seedDay(application, {
          date: dateAgo(application, 1),
          items: [{ name: "Deleted coffee", calories: 100 }],
        });
        await seedDay(application, {
          date: today(application),
          items: [{ name: "Edited coffee", calories: 50 }],
        });
      },
    });
    const deleted = logic.state.entries.find(
      (entry) => entry.items[0]?.name === "Deleted coffee",
    );
    const edited = logic.state.entries.find(
      (entry) => entry.items[0]?.name === "Edited coffee",
    );

    await frontend.api.meals[":id"].$delete({
      param: { id: deleted?.id ?? "" },
    });
    await frontend.api.meals[":id"].$patch({
      param: { id: edited?.id ?? "" },
      json: {
        items: [{ name: "Edited coffee", calories: 80, caffeineMg: 60 }],
      },
    });
    await events.emit({ type: "entriesChanged", message: "Saved." });

    expect(
      logic.state.entries.map((entry) => entry.items[0]?.name).toSorted(),
    ).toEqual(["Edited coffee", "Old coffee"]);
    expect(
      logic.state.days.find((day) => day.date === dateAgo(app, 1)),
    ).toMatchObject({ mealCount: 0, calories: 0 });
    const day = logic.state.days.find(
      (candidate) => candidate.date === today(app),
    );
    expect(day?.calories).toEqual(80);
    expect(day?.nutrients.caffeineMg.amount).toEqual(60);
    expect(day?.nutrients.fiberG.amount).toEqual(null);
  });

  it("should read the goals again after the owner saved settings or a weight", async () => {
    const { logic, settingsEvents, weightEvents, ...app } = await setupTest();
    expect(logic.state.calorieTarget).toEqual(2400);

    await patchSettings(app, {
      dailyCalorieTarget: 1900,
      proteinGoalMode: "gramsPerKg",
      dailyProteinTargetPerKg: 2,
    });
    await settingsEvents.emit({ type: "settingsSaved", message: "Saved." });
    expect(logic.state.calorieTarget).toEqual(1900);
    expect(logic.state.proteinTargets.at(-1)?.targetG).toEqual(null);

    await saveWeight(app, today(app), 70);
    await weightEvents.emit({ type: "weightSaved", message: "Saved." });
    expect(logic.state.proteinTargets.at(-1)?.targetG).toEqual(140);
  });

  it("should say that the insights cannot be read without a session", async () => {
    const { logic } = await setupTest({ authenticated: false });

    expect(logic.state.loaded).toEqual(false);
    expect(logic.state.loadState).toEqual("error");
    expect(logic.state.loadError).toEqual("Sign in to continue.");
  });

  it("should keep what it shows when a later read fails", async () => {
    const { logic, transport } = await setupTest();

    transport.goOffline();
    await logic.load();

    expect(logic.state.loaded).toEqual(true);
    expect(logic.state.loadState).toEqual("error");
    expect(logic.state.loadError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
    transport.goOnline();
    await logic.load();
    expect(logic.state.loadState).toEqual("success");
    expect(logic.state.loadError).toEqual(null);
  });

  it("should read again when the window gets the focus, as on a new day", async () => {
    const { frontend, logic } = await setupTest();
    expect(logic.state.entries).toEqual([]);

    await seedDay(
      { frontend },
      {
        date: new Date().toISOString().slice(0, 10),
        items: [{ name: "Late oats" }],
      },
    );
    frontend.services.windowFocus.focus();
    await vi.waitFor(() => expect(logic.state.entries).toHaveLength(1));
  });
});

describe("InsightsLogic choice tests", () => {
  it("should fold the insights away and open them again", async () => {
    const { logic } = await setupTest();

    logic.toggleCollapsed();
    expect(logic.state.collapsed).toEqual(true);
    logic.toggleCollapsed();
    expect(logic.state.collapsed).toEqual(false);
  });

  it("should keep the choices of a panel", async () => {
    const { logic } = await setupTest();

    logic.choose({ repeatRange: 7, repeatMetric: "fiber" });
    expect(logic.state).toMatchObject({
      repeatRange: 7,
      repeatMetric: "fiber",
      repeatBand: "90–110%",
    });
  });

  it("should point both food panels at the nutrient of a finding", async () => {
    const { logic } = await setupTest();
    logic.choose({ scenarioCandidateId: "a:0", sourceKey: "oats" });

    logic.compareFoodChange({ nutrient: "sodiumMg" });

    expect(logic.state).toMatchObject({
      focusedNutrient: "sodiumMg",
      sourceNutrient: "sodiumMg",
      sourceKey: null,
      scenarioCandidateId: null,
    });
  });
});
