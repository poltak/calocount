import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
} from "../../core/tests/full-application.js";
import { DashboardLogic } from "./dashboard-logic.js";
import { patchSettings } from "./dashboard-test-setup.js";
import { seedEntry } from "./entry-test-helpers.js";

function dashboardOf({ frontend }: Pick<FullApplication, "frontend">) {
  return new DashboardLogic({
    ...frontend,
    entryEvents: [],
    settingsEvents: [],
    weightEvents: [],
  });
}

/** The dashboard of the partner page: its requests name the partner log. */
function partnerDashboardOf({ frontend }: Pick<FullApplication, "frontend">) {
  return dashboardOf({
    frontend: { ...frontend, api: frontend.partnerApi, profile: "partner" },
  });
}

function setupTest() {
  return setupLogicTest({}, (app) => dashboardOf(app));
}

describe("DashboardLogic partner profile tests", () => {
  it("should know whether the owner keeps a partner profile", async () => {
    const app = await setupTest();
    const { logic } = app;
    expect(logic.state.partnerProfileEnabled).toEqual(false);

    await patchSettings(app, { partnerProfileEnabled: true });
    await logic.loadDashboard();

    expect(logic.state.partnerProfileEnabled).toEqual(true);
  });

  it("should refuse the partner dashboard while the profile is off", async () => {
    const app = await setupTest();
    const partner = partnerDashboardOf(app);

    await partner.initialize();

    expect(partner.state.loaded).toEqual(false);
    expect(partner.state.loadDashboardError).toEqual(
      "The partner profile is off.",
    );
    await partner.cleanup();
  });

  it("should keep the entries of the partner apart from the owner", async () => {
    const app = await setupTest();
    const { logic, backend, frontend } = app;
    await patchSettings(app, { partnerProfileEnabled: true });
    await seedEntry(app, { name: "Owner breakfast", calories: 320 });
    const partnerApp = {
      frontend: { ...frontend, api: frontend.partnerApi },
    };
    await seedEntry(partnerApp, { name: "Partner lunch", calories: 450 });
    const partner = partnerDashboardOf(app);

    await partner.initialize();
    await logic.loadDashboard();

    expect(partner.state.entries.map((entry) => entry.name)).toEqual([
      "Partner lunch",
    ]);
    expect(logic.state.entries.map((entry) => entry.name)).toEqual([
      "Owner breakfast",
    ]);
    expect(partner.state.partnerProfileEnabled).toEqual(true);
    const keys = await backend.db
      .selectFrom("mealLogs")
      .select("ownerKey")
      .orderBy("ownerKey")
      .execute();
    expect(keys.map((row) => row.ownerKey)).toEqual([
      backend.config.ownerKey,
      `${backend.config.ownerKey}:partner`,
    ]);
    await partner.cleanup();
  });
});
