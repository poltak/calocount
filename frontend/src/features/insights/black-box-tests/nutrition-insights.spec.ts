import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { InsightsPageObject } from "./insights-page-object.js";

test.describe("nutrition insights", () => {
  test("should show insight panels for entries on two days", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Today oats", calories: 400, protein: 20 });
    await today.goToPreviousDay();
    await today.addEntry({
      name: "Yesterday oats",
      calories: 300,
      protein: 15,
    });
    await today.goto();
    const insights = new InsightsPageObject(page);
    await insights.showNutrition();
    for (const name of [
      "Nutrition overview",
      "Nutrition attention",
      "Nutrition food insights",
      "Frequency & amount",
      "What changed this week?",
      "Days worth repeating",
    ]) {
      await expect(insights.panel(name)).toBeVisible();
    }
  });
});
