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
    await today.addEntry({
      name: "Today oats",
      calories: 400,
      protein: 20,
      nutrients: { Fiber: 4, Sodium: 500 },
    });
    await today.goToPreviousDay();
    await today.addEntry({
      name: "Yesterday oats",
      calories: 300,
      protein: 15,
      nutrients: { Fiber: 3, Sodium: 400 },
    });
    await today.goto();
    const insights = new InsightsPageObject(page);
    await insights.showNutrition();
    await expect(insights.panel("Nutrition overview")).toContainText(
      "Fiber4g/ 28g",
    );
    await expect(insights.panel("Nutrition overview")).toContainText(
      "Sodium500mg",
    );
    await expect(insights.panel("Nutrition overview")).toContainText(
      "14% of goal",
    );
    await expect(insights.panel("Nutrition attention")).toContainText(
      "No persistent shortfalls yet",
    );
    await expect(insights.panel("What changed this week?")).toContainText(
      "1/7 recorded days",
    );
    await expect(insights.panel("What changed this week?")).toContainText(
      "A comparison needs at least one recorded day in both periods.",
    );
    await expect(insights.panel("Frequency & amount")).toContainText(
      "Yesterday oats",
    );
    await expect(insights.panel("Days worth repeating")).toContainText(
      "Yesterday oats",
    );
    await expect(insights.panel("Nutrition food insights")).toContainText(
      "Compare a food change",
    );
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
