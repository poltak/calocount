import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";
import {
  daysAgo,
  shortDayLabel,
  TodayPageObject,
} from "../../entries/black-box-tests/today-page-object.js";

test.describe("the nutrient trend", () => {
  test("should plot known days and mark unknown days as gaps", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({
      name: "Lentil soup",
      calories: 280,
      nutrients: { Fiber: 4 },
    });
    const panel = today.trendPanel("Nutrient trend");

    await expect(today.nutrientTrendChart("Fiber")).toBeVisible();
    await expect(
      today.trendDay("Nutrient trend", daysAgo(0)),
    ).toHaveAccessibleName(`${shortDayLabel(daysAgo(0))}: 4 g`);
    await expect(today.trendDays("Nutrient trend", /: unknown$/)).toHaveCount(
      6,
    );
    await expect(panel).toContainText("1 of 7 days known · Partial");

    await today.nutrientTrendChoice().selectOption({ label: "Caffeine" });

    await expect(today.trendDays("Nutrient trend", /: unknown$/)).toHaveCount(
      7,
    );
    await expect(panel).toContainText("0 of 7 days known");
  });
});

test.describe("the words of the nutrient trend", () => {
  test("should call a guideline a limit, a plain Daily Value a reference, and the owner's own goal a limit", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Soup", calories: 200 });
    const panel = today.trendPanel("Nutrient trend");

    await today.nutrientTrendChoice().selectOption({ label: "Sodium" });
    await expect(panel).toContainText("Daily limit 2,300 mg");
    await today.nutrientTrendChoice().selectOption({ label: "Cholesterol" });
    await expect(panel).toContainText("Daily reference 300 mg");

    const settings = new SettingsPageObject(page);
    await settings.open();
    await settings.nutritionGoals.click();
    await settings.field("Cholesterol daily goal").fill("250");
    await settings.save();
    await today.nutrientTrendChoice().selectOption({ label: "Cholesterol" });
    await expect(panel).toContainText("Daily limit 250 mg");
  });
});
