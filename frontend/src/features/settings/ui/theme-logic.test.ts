import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../../core/tests/full-application.js";
import { ThemeLogic } from "./theme-logic.js";

function setupTest() {
  return setupLogicTest({}, (app) => new ThemeLogic(app.frontend));
}

describe("ThemeLogic tests", () => {
  it("should follow the device when no choice was made", async () => {
    const { logic, frontend } = await setupTest();

    expect(logic.state.preference).toEqual("system");
    expect(frontend.services.theme.applied).toEqual(["system"]);
  });

  it.each(["light", "dark", "system"] as const)(
    "should apply the %s choice and keep it under the key of the old app",
    async (preference) => {
      const { logic, frontend } = await setupTest();

      logic.select({ preference });

      expect(logic.state.preference).toEqual(preference);
      expect(frontend.services.theme.applied.at(-1)).toEqual(preference);
      expect(frontend.browserStorage.getItem("calocount:theme")).toEqual(
        preference,
      );
    },
  );

  it("should read the saved choice after a reload", async () => {
    const { frontend } = await setupTest();
    frontend.browserStorage.setItem("calocount:theme", "dark");

    const later = new ThemeLogic(frontend);
    await later.initialize();

    expect(later.state.preference).toEqual("dark");
    expect(frontend.services.theme.applied.at(-1)).toEqual("dark");
  });

  it("should treat a saved value that is not a theme as the device choice", async () => {
    const { frontend } = await setupTest();
    frontend.browserStorage.setItem("calocount:theme", "purple");

    expect(new ThemeLogic(frontend).state.preference).toEqual("system");
  });
});
