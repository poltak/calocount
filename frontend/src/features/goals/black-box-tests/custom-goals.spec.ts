import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";
import { ProteinGoalPageObject } from "./protein-goal-page-object.js";

test.describe("custom calorie and protein goals", () => {
  test("should show the goals on the summary cards, the protein card and the trend charts", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const settings = new SettingsPageObject(page);
    const protein = new ProteinGoalPageObject(page);
    await today.goto();
    await settings.open();
    await settings.field("Fixed grams").check();
    await settings.field("Protein (g)").fill("90");
    await settings.field("Calories").fill("1800");
    await settings.save();

    await today.addEntry({ name: "Lunch bowl", calories: 450, protein: 30 });

    await expect(today.summary).toContainText("450 / 1,800");
    await expect(today.summary).toContainText("1,350 kcal left today");
    await expect(today.summary).toContainText("25%");
    await expect(today.summary).toContainText("30g / 90g");
    await expect(today.summary).toContainText("60g left to reach your target");
    await expect(today.summary).toContainText("33%");
    await expect(protein.target(90)).toBeVisible();
    await expect(today.trendPanel("Calorie trend")).toContainText(
      "Target 1,800",
    );
    await expect(today.trendPanel("Protein vs target")).toContainText(
      "30g / 90g",
    );
    await page.reload();
    await expect(today.summary).toContainText("450 / 1,800");
    await expect(today.summary).toContainText("30g / 90g");
  });

  test("should show the calories above a custom goal as over the goal", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const settings = new SettingsPageObject(page);
    await today.goto();
    await settings.open();
    await settings.field("Calories").fill("300");
    await settings.save();

    await today.addEntry({ name: "Big pasta", calories: 500, protein: 20 });

    await expect(today.summary).toContainText("500 / 300");
    await expect(today.summary).toContainText("200 kcal over");
  });
});
