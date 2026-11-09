import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";

test.describe("partner log", () => {
  test("should keep the partner log separate and hide owner settings", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const settings = new SettingsPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Owner breakfast", calories: 320 });
    await settings.open();
    await settings.field("Keep a second log for a partner").check();
    await settings.save();
    await today.openPartner();
    await expect(today.entry("Owner breakfast")).toBeHidden();
    await today.addEntry({ name: "Partner lunch", calories: 450 });
    await settings.open();
    await expect(
      settings.field("Keep a second log for a partner"),
    ).toBeHidden();
    await expect(
      settings.field("Show my log to anyone who opens the site address"),
    ).toBeHidden();
    await settings.save();
    await today.goto();
    await expect(today.entry("Owner breakfast")).toBeVisible();
    await expect(today.entry("Partner lunch")).toBeHidden();
  });
});
