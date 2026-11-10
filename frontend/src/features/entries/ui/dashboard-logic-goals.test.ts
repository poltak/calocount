import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { SettingsEvent } from "../../settings/types.js";
import type { WeightEvent } from "../../weights/types.js";
import type { EntryEvent } from "../types.js";
import { DashboardLogic } from "./dashboard-logic.js";
import {
  patchSettings,
  saveWeight,
  type Seed,
} from "./dashboard-test-setup.js";
import { dateAgo, todayKey } from "./entry-test-helpers.js";

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

describe("DashboardLogic goal tests", () => {
  it("should read the goals of the owner", async () => {
    const { backend, logic } = await setupTest();
    await backend.db
      .insertInto("settings")
      .values({
        id: "settings_default",
        ownerKey: backend.config.ownerKey,
        timezone: "UTC",
        dailyCalorieTarget: 1800,
        dailyProteinTargetG: 120,
        proteinGoalMode: "grams",
        dailyProteinTargetPerKg: null,
        nutrientTargetsJson: null,
        vitaminB6UsFnbAdultUlEnabled: 0,
        vitaminB6UsFnbAdultUlConfirmedAt: null,
        usFnbAdultUlEnabled: 0,
        usFnbAdultUlConfirmedAt: null,
        partnerProfileEnabled: 0,
        publicViewEnabled: 0,
        activeAiProfileId: null,
        photoRetentionDays: 30,
        createdAt: 1,
        updatedAt: 1,
      })
      .execute();

    await logic.loadDashboard();
    expect(logic.state.targets).toMatchObject({
      calories: 1800,
      proteinG: 120,
    });
    expect(logic.state.proteinGoal?.targetG).toEqual(120);

    await backend.db
      .updateTable("settings")
      .set({ proteinGoalMode: "gramsPerKg" })
      .execute();
    await logic.loadDashboard();
    expect(logic.state.targets).toMatchObject({
      calories: 1800,
      proteinG: null,
    });
    expect(logic.state.proteinGoal).toEqual({
      targetG: null,
      weightKg: null,
      weightDate: null,
    });
  });

  it("should read the weight of the day, and the weights of the recent days", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await saveWeight(application, dateAgo(application, 2), 69);
        await saveWeight(application, todayKey(application), 70);
      },
    });

    expect(logic.state.weight).toMatchObject({
      logicalDate: todayKey(app),
      weightKg: 70,
    });
    expect(logic.state.recentWeights.map((w) => w.weightKg)).toEqual([69, 70]);

    await logic.goToPreviousDay();
    expect(logic.state.weight).toEqual(null);
  });

  it("should calculate a protein goal per kilogram from the weight of the day or the latest earlier one", async () => {
    const { logic, ...app } = await setupTest({
      seed: async (application) => {
        await patchSettings(application, {
          proteinGoalMode: "gramsPerKg",
          dailyProteinTargetPerKg: 2,
        });
        await saveWeight(application, dateAgo(application, 3), 60);
      },
    });

    expect(logic.state.proteinGoal).toEqual({
      targetG: 120,
      weightKg: 60,
      weightDate: dateAgo(app, 3),
    });
    expect(logic.state.targets.proteinG).toEqual(120);

    await saveWeight(app, todayKey(app), 70);
    await logic.loadDashboard();
    expect(logic.state.proteinGoal).toMatchObject({
      targetG: 140,
      weightDate: todayKey(app),
    });

    await logic.selectDate({ date: dateAgo(app, 5) });
    expect(logic.state.proteinGoal?.targetG).toEqual(null);
  });

  it("should read the nutrition goals with their defaults and the custom values", async () => {
    const { logic } = await setupTest({
      seed: (application) =>
        patchSettings(application, {
          nutrientTargets: { cholesterolMg: 250, sodiumMg: null },
        }),
    });

    const goals = logic.state.targets.nutrients;
    expect(goals.fiberG).toEqual({
      value: 28,
      direction: "minimum",
      source: "default",
    });
    expect(goals.cholesterolMg).toMatchObject({ value: 250, source: "custom" });
    expect(goals.sodiumMg).toMatchObject({ value: null, source: "disabled" });
    expect(goals.totalSugarsG.value).toEqual(null);
  });

  it("should read again after the owner saved the targets or a weight", async () => {
    const settingsEvents = new EventEmitter<SettingsEvent>();
    const weightEvents = new EventEmitter<WeightEvent>();
    const app = await setupLogicTest(
      {},
      (application) =>
        new DashboardLogic({
          ...application.frontend,
          entryEvents: [],
          settingsEvents: [settingsEvents],
          weightEvents: [weightEvents],
        }),
    );

    await patchSettings(app, { dailyCalorieTarget: 1900 });
    await settingsEvents.emit({
      type: "settingsSaved",
      message: "Targets saved.",
    });
    expect(app.logic.state.targets.calories).toEqual(1900);
    expect(app.logic.state.statusMessage).toEqual("Targets saved.");

    await saveWeight(app, todayKey(app), 71);
    await weightEvents.emit({ type: "weightSaved", message: "Weight saved." });
    expect(app.logic.state.weight?.weightKg).toEqual(71);
    expect(app.logic.state.statusMessage).toEqual("Weight saved.");
  });
});
