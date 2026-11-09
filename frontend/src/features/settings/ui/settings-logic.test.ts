import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../../core/tests/full-application.js";
import { SettingsLogic } from "./settings-logic.js";

function setupTest() {
  return setupLogicTest({}, (app) => new SettingsLogic(app.frontend));
}

describe("SettingsLogic tests", () => {
  it("should start with the dialog closed", async () => {
    const { logic } = await setupTest();

    expect(logic.state.isOpen).toEqual(false);
  });

  it("should open the dialog, and close it again", async () => {
    const { logic } = await setupTest();

    logic.open();
    expect(logic.state.isOpen).toEqual(true);

    logic.close();
    expect(logic.state.isOpen).toEqual(false);
  });
});
