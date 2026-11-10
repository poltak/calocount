import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../../core/tests/full-application.js";
import { SettingsLogic } from "./settings-logic.js";

function setupTest() {
  return setupLogicTest({}, (app) => new SettingsLogic(app.frontend));
}

describe("SettingsLogic public view tests", () => {
  it("should start private for an owner who saved nothing", async () => {
    const { logic } = await setupTest();

    await logic.open();

    expect(logic.state.draft?.publicViewEnabled).toEqual(false);
  });

  it("should save the public view, and show it on the next opening", async () => {
    const { logic, backend } = await setupTest();
    await logic.open();

    logic.changeDraft({ change: { publicViewEnabled: true } });
    await logic.save();

    expect(logic.state.saveState).toEqual("success");
    const row = await backend.db
      .selectFrom("settings")
      .select("publicViewEnabled")
      .executeTakeFirstOrThrow();
    expect(row.publicViewEnabled).toEqual(1);
    await logic.open();
    expect(logic.state.draft?.publicViewEnabled).toEqual(true);

    logic.changeDraft({ change: { publicViewEnabled: false } });
    await logic.save();
    await logic.open();
    expect(logic.state.draft?.publicViewEnabled).toEqual(false);
  });
});
