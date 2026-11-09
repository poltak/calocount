import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";

test.describe("nutrition goals", () => {
  test("should keep primary goals separate and save a custom nutrition goal", async ({
    page,
  }) => {
    await new TodayPageObject(page).goto();
    const settings = new SettingsPageObject(page);
    await settings.open();
    await expect(settings.primaryGoals).toBeVisible();
    await expect(settings.field("Fiber daily goal")).toBeHidden();
    await settings.nutritionGoals.click();
    await settings.field("Fiber daily goal").fill("35");
    await settings.field("Sodium daily goal").fill("");
    await settings.save();
    await page.reload();
    await settings.open();
    await settings.nutritionGoals.click();
    await expect(settings.field("Fiber daily goal")).toHaveValue("35");
    await expect(settings.field("Sodium daily goal")).toHaveValue("");
  });
  test("should refuse a negative nutrition goal and keep the saved value", async ({
    page,
  }) => {
    await new TodayPageObject(page).goto();
    const settings = new SettingsPageObject(page);
    await settings.open();
    await settings.nutritionGoals.click();
    const oldValue = await settings.field("Fiber daily goal").inputValue();
    await settings.field("Fiber daily goal").fill("-3");
    await settings.attemptSave();
    await expect(settings.dialog).toBeVisible();
    await page.reload();
    await settings.open();
    await settings.nutritionGoals.click();
    await expect(settings.field("Fiber daily goal")).toHaveValue(oldValue);
  });
});
