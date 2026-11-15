import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";

test.describe("nutrition references", () => {
  for (const label of [
    "I am 19 or older; use the U.S. adult vitamin B6 upper limit",
    "I am 19 or older; use applicable U.S. nutrient upper limits",
  ]) {
    test(`should require explicit consent for ${label}`, async ({ page }) => {
      await new TodayPageObject(page).goto();
      const settings = new SettingsPageObject(page);
      await settings.open();
      await expect(settings.field(label)).not.toBeChecked();
      await settings.field(label).check();
      await settings.save();
      await page.reload();
      await settings.open();
      await expect(settings.field(label)).toBeChecked();
      await settings.field(label).uncheck();
      await settings.save();
      await page.reload();
      await settings.open();
      await expect(settings.field(label)).not.toBeChecked();
    });
  }
});
