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
  test("should show how often and how much of each food was logged, and the entries of the selected food", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    await logFoods(today);
    await insights.showNutrition();
    const panel = insights.panel("Frequency & amount");

    await expect(panel).toContainText("3 of 30 days have logs");
    await expect(insights.frequencyFood("Eggs")).toContainText(
      "0.5×/week · 500 kcal avg",
    );
    await expect(insights.frequencyFood("Toast")).toContainText(
      "0.2×/week · 300 kcal avg",
    );
    await expect(panel).toContainText("EggsTimes logged2");
    await expect(panel).toContainText("Total contribution1,000 kcal");
    await expect(panel).toContainText("Known coverage2 of 2 entries");

    await insights.frequencyFood("Toast").click();

    await expect(panel).toContainText("ToastTimes logged1");
    await expect(panel).toContainText("Avg amount300 kcal");

    await insights.frequencyFood("Eggs").click();
    await insights.choice(panel, "Amount").selectOption("Sodium");

    await expect(panel).toContainText("Avg amount1,450 mg");
    await insights.button(panel, "7 days").click();
    await expect(panel).toContainText("2 of 7 days have logs");
    await expect(insights.frequencyPoint("Toast")).toHaveCount(0);
  });

  test("should compare the last two weeks and name the foods behind the change", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    await logFoods(today);
    await insights.showNutrition();
    const panel = insights.panel("What changed this week?");

    await expect(panel).toContainText("1/7 recorded days");
    await expect(panel).toContainText("2/7 recorded days");
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
    await expect(panel).toContainText(
      "What contributed to the calories change?",
    );
    await expect(panel).toContainText("Eggs+500 kcal0 kcal → 500 kcal");
    await expect(panel).toContainText("Toast-300 kcal300 kcal → 0 kcal");

    await insights.weeklyMeasure("Protein").click();

    await expect(panel).toContainText(
      "What contributed to the protein change?",
    );
    await expect(panel).toContainText("Eggs+30 g0 g → 30 g");
  });

  test("should list the finished days that matched the current targets, and show what was eaten on one", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    const settings = new SettingsPageObject(page);
    await logFoods(today);
    await settings.open();
    await settings.field("Fixed grams").check();
    await settings.field("Protein (g)").fill("30");
    await settings.field("Calories").fill("500");
    await settings.save();
    await page.reload();
    await insights.showNutrition();
    const panel = insights.panel("Days worth repeating");

    await expect(panel).toContainText("Showing 3 of 3 logged days.");
    await expect(panel).toContainText(insightDayLabel(daysAgo(1)));
    await expect(panel).toContainText("100% of the current calorie target");
    await expect(panel).toContainText(
      "Eggs1 serving · 500 kcal · 30 g protein",
    );

    await insights
      .choice(panel, "Inspect a day")
      .selectOption({ label: insightDayLabel(daysAgo(9)) });

    await expect(panel).toContainText("60% of the current calorie target");
    await expect(panel).toContainText(
      "Toast1 serving · 300 kcal · 10 g protein",
    );
    await insights.choice(panel, "Range").selectOption("Last 7 days");
    await expect(panel).toContainText("Showing 2 of 2 logged days.");
  });
});
