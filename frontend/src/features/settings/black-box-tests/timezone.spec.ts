import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "./settings-page-object.js";

test.use({ timezoneId: "Europe/Berlin" });
test.describe("saved timezone", () => {
  test("should show the saved timezone and save this device's timezone", async ({
    page,
  }) => {
    await new TodayPageObject(page).goto();
    const settings = new SettingsPageObject(page);
    await settings.open();
    await settings.timezone.selectOption("UTC");
    await settings.save();
    await page.reload();
    await settings.open();
    await expect(settings.timezone).toHaveValue("UTC");
    await settings.useDeviceTimezone();
    await settings.save();
    await page.reload();
    await settings.open();
    await expect(settings.timezone).toHaveValue("Europe/Berlin");
  });
});
