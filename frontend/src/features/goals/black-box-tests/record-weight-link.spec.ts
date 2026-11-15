import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";
import { ProteinGoalPageObject } from "./protein-goal-page-object.js";

test.describe("the owner follows the link to record a weight", () => {
  test("should open the weight form with the weight field ready", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const settings = new SettingsPageObject(page);
    const protein = new ProteinGoalPageObject(page);
    await today.goto();
    await settings.open();
    await settings.field("Grams per kilogram").check();
    await settings.field("Protein (g/kg)").fill("2");
    await settings.save();
    await expect(protein.missingWeightNotice).toBeVisible();
    await expect(today.weightField).toBeHidden();

    await today.recordWeightLink.click();

    await expect(today.weightField).toBeVisible();
    await expect(today.weightField).toBeFocused();
    await today.weightField.fill("70");
    await today.saveWeightButton.click();
    await expect(protein.target(140)).toBeVisible();
  });
});
