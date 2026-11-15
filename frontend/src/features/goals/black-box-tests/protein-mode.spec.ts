import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { ProteinGoalPageObject } from "./protein-goal-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";

test.describe("protein goal modes", () => {
  test("should ask for weight and refresh the target when the mode changes", async ({
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
    await today.saveWeight(70, { editing: false });
    await expect(protein.target(140)).toBeVisible();
    await settings.open();
    await settings.field("Fixed grams").check();
    await settings.field("Protein (g)").fill("120");
    await settings.field("Calories").fill("2100");
    await settings.save();
    await expect(protein.target(120)).toBeVisible();
    await expect(today.summary).toContainText("/ 2,100");
    await page.reload();
    await expect(protein.target(120)).toBeVisible();
    await expect(today.summary).toContainText("/ 2,100");
  });
});
