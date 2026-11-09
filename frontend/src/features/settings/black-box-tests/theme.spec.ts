import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "./settings-page-object.js";

test.describe("theme preference", () => {
  for (const theme of ["Light", "Dark", "System"]) {
    test(`should keep the ${theme} choice after a reload`, async ({ page }) => {
      await new TodayPageObject(page).goto();
      const settings = new SettingsPageObject(page);
      await settings.open();
      await settings.field(theme).check();
      await page.reload();
      await settings.open();
      await expect(settings.field(theme)).toBeChecked();
    });
  }
});
