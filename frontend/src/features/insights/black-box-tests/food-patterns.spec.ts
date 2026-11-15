import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import {
  TodayPageObject,
  daysAgo,
} from "../../entries/black-box-tests/today-page-object.js";
import { InsightsPageObject, insightDayLabel } from "./insights-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";

/** Eggs on two days, toast nine days ago, and today's oats. */
async function logFoods(today: TodayPageObject) {
  await today.goto();
  await today.addEntry({ name: "Oats", calories: 400, protein: 20 });
  await today.logHistory([
    {
      daysAgo: 1,
      entry: {
        name: "Eggs",
        calories: 500,
        protein: 30,
        nutrients: { Fiber: 5, Sodium: 2500 },
      },
    },
    {
      daysAgo: 2,
      entry: {
        name: "Eggs",
        calories: 500,
        protein: 30,
        nutrients: { Fiber: 5, Sodium: 400 },
      },
    },
    {
      daysAgo: 9,
      entry: {
        name: "Toast",
        calories: 300,
        protein: 10,
        nutrients: { Fiber: 3, Sodium: 600 },
      },
    },
  ]);
}

test.describe("food pattern insights", () => {
  test("should show how often and how much of each food was logged, compare the last two weeks, and list the days that matched the current targets", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    const settings = new SettingsPageObject(page);
    await logFoods(today);
    await insights.showNutrition();
    const frequencyPanel = insights.panel("Frequency & amount");

    await expect(frequencyPanel).toContainText("3 of 30 days have logs");
    await expect(insights.frequencyFood("Eggs")).toContainText(
      "0.5×/week · 500 kcal avg",
    );
    await expect(insights.frequencyFood("Toast")).toContainText(
      "0.2×/week · 300 kcal avg",
    );
    await expect(frequencyPanel).toContainText("EggsTimes logged2");
    await expect(frequencyPanel).toContainText("Total contribution1,000 kcal");
    await expect(frequencyPanel).toContainText("Known coverage2 of 2 entries");

    await insights.frequencyFood("Toast").click();

    await expect(frequencyPanel).toContainText("ToastTimes logged1");
    await expect(frequencyPanel).toContainText("Avg amount300 kcal");

    await insights.frequencyFood("Eggs").click();
    await insights.choice(frequencyPanel, "Amount").selectOption("Sodium");

    await expect(frequencyPanel).toContainText("Avg amount1,450 mg");
    await insights.button(frequencyPanel, "7 days").click();
    await expect(frequencyPanel).toContainText("2 of 7 days have logs");
    await expect(insights.frequencyPoint("Toast")).toHaveCount(0);

    const changePanel = insights.panel("What changed this week?");

    await expect(changePanel).toContainText("1/7 recorded days");
    await expect(changePanel).toContainText("2/7 recorded days");
    await expect(insights.weeklyMeasure("Calories")).toContainText(
      "Before300 kcalAfter500 kcal+200 kcal per recorded day",
    );
    await expect(insights.weeklyMeasure("Protein")).toContainText(
      "Before10 gAfter30 g+20 g per recorded day",
    );
    await expect(insights.weeklyMeasure("Sodium")).toContainText(
      "Before600 mgAfter1,450 mg+850 mg per recorded day",
    );
    await expect(insights.weeklyMeasure("Caffeine")).toContainText(
      "Change unavailable",
    );
    await expect(changePanel).toContainText(
      "What contributed to the calories change?",
    );
    await expect(changePanel).toContainText("Eggs+500 kcal0 kcal → 500 kcal");
    await expect(changePanel).toContainText("Toast-300 kcal300 kcal → 0 kcal");

    await insights.weeklyMeasure("Protein").click();

    await expect(changePanel).toContainText(
      "What contributed to the protein change?",
    );
    await expect(changePanel).toContainText("Eggs+30 g0 g → 30 g");

    await settings.open();
    await settings.field("Fixed grams").check();
    await settings.field("Protein (g)").fill("30");
    await settings.field("Calories").fill("500");
    await settings.save();
    await page.reload();
    await insights.showNutrition();
    const repeatPanel = insights.panel("Days worth repeating");

    await expect(repeatPanel).toContainText("Showing 3 of 3 logged days.");
    await expect(repeatPanel).toContainText(insightDayLabel(daysAgo(1)));
    await expect(repeatPanel).toContainText(
      "100% of the current calorie target",
    );
    await expect(repeatPanel).toContainText(
      "Eggs1 serving · 500 kcal · 30 g protein",
    );

    await insights
      .choice(repeatPanel, "Inspect a day")
      .selectOption({ label: insightDayLabel(daysAgo(9)) });

    await expect(repeatPanel).toContainText(
      "60% of the current calorie target",
    );
    await expect(repeatPanel).toContainText(
      "Toast1 serving · 300 kcal · 10 g protein",
    );
    await insights.choice(repeatPanel, "Range").selectOption("Last 7 days");
    await expect(repeatPanel).toContainText("Showing 2 of 2 logged days.");
  });
});
