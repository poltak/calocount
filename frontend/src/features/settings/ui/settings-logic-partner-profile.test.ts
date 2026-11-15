import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type FullApplication,
} from "../../core/tests/full-application.js";
import { SettingsLogic } from "./settings-logic.js";

function setupTest() {
  return setupLogicTest({}, (app) => new SettingsLogic({ ...app.frontend }));
}

/** The settings dialog of the partner page: its requests name the partner log. */
function partnerSettings({ frontend }: Pick<FullApplication, "frontend">) {
  return new SettingsLogic({
    ...frontend,
    api: frontend.partnerApi,
    profile: "partner",
  });
}

describe("SettingsLogic partner profile tests", () => {
  it("should start with the partner profile off, and keep the switch after a save", async () => {
    const { logic, backend } = await setupTest();
    await logic.open();
    expect(logic.state.draft?.partnerProfileEnabled).toEqual(false);

    logic.changeDraft({ change: { partnerProfileEnabled: true } });
    await logic.save();

    expect(logic.state.saveState).toEqual("success");
    const row = await backend.db
      .selectFrom("settings")
      .select("partnerProfileEnabled")
      .executeTakeFirstOrThrow();
    expect(row.partnerProfileEnabled).toEqual(1);
    await logic.open();
    expect(logic.state.draft?.partnerProfileEnabled).toEqual(true);

    logic.changeDraft({ change: { partnerProfileEnabled: false } });
    await logic.save();
    await logic.open();
    expect(logic.state.draft?.partnerProfileEnabled).toEqual(false);
  });

  it("should refuse the partner settings while the profile is off", async () => {
    const app = await setupTest();
    const partner = partnerSettings(app);

    await partner.open();

    expect(partner.state.loadState).toEqual("error");
    expect(partner.state.loadError).toEqual("The partner profile is off.");
    await partner.cleanup();
  });

  it("should keep the partner settings apart from the owner settings", async () => {
    const app = await setupTest();
    const { logic, backend } = app;
    await logic.open();
    logic.changeDraft({
      change: { partnerProfileEnabled: true, calories: "2100" },
    });
    await logic.save();
    const partner = partnerSettings(app);

    await partner.open();
    expect(partner.state.draft?.calories).toEqual("2400");
    // The partner page sends no owner-only field, whatever its draft holds.
    partner.changeDraft({
      change: { calories: "1500", partnerProfileEnabled: false },
    });
    await partner.save();

    expect(partner.state.saveState).toEqual("success");
    const rows = await backend.db
      .selectFrom("settings")
      .select(["ownerKey", "dailyCalorieTarget", "partnerProfileEnabled"])
      .orderBy("ownerKey")
      .execute();
    expect(rows).toEqual([
      {
        ownerKey: backend.config.ownerKey,
        dailyCalorieTarget: 2100,
        partnerProfileEnabled: 1,
      },
      {
        ownerKey: `${backend.config.ownerKey}:partner`,
        dailyCalorieTarget: 1500,
        partnerProfileEnabled: 0,
      },
    ]);
    await partner.cleanup();
  });

  it("should refuse an owner-only setting from the partner profile", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    await logic.open();
    logic.changeDraft({ change: { partnerProfileEnabled: true } });
    await logic.save();

    const response = await transport.fetch(
      "http://app.test/api/settings?profile=partner",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicViewEnabled: true }),
      },
    );

    expect(response.status).toEqual(400);
  });

  it("should refuse an unknown profile", async () => {
    const { logic, transport } = await setupTest();
    await logic.open();

    const response = await transport.fetch(
      "http://app.test/api/settings?profile=guest",
    );

    expect(response.status).toEqual(400);
    expect(await response.json()).toMatchObject({
      error: { message: "profile must be owner or partner." },
    });
  });
});
