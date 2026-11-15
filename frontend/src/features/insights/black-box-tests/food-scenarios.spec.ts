import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import {
  TodayPageObject,
  daysAgo,
  shortDayLabel,
} from "../../entries/black-box-tests/today-page-object.js";
import { InsightsPageObject } from "./insights-page-object.js";

/** Eggs on two days, toast nine days ago, and today's oats. */
async function logFoods(today: TodayPageObject) {
  await today.goto();
  await today.addEntry({
    name: "Oats",
    calories: 400,
    protein: 20,
    nutrients: { Fiber: 4, Sodium: 500 },
  });
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

test.describe("nutrition food insights", () => {
  test("should compare adding or replacing a logged food without changing the totals, and show how an excluded food source changes a nutrient", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    await logFoods(today);
    await insights.showNutrition();
    const compareCard = insights.card("Compare a food change");

    await expect(compareCard).toContainText(
      "Adding Eggs at 1× the logged portion.",
    );
    await expect(compareCard).toContainText("Calories0 kcal500 kcal+500 kcal");
    await insights.button(compareCard, "1.5×").click();
    await expect(compareCard).toContainText(
      "Adding Eggs at 1.5× the logged portion.",
    );
    await expect(compareCard).toContainText("Calories0 kcal750 kcal+750 kcal");
    await insights
      .choice(compareCard, "Food to add")
      .selectOption(`Toast · 1 serving · ${shortDayLabel(daysAgo(9))}`);
    await expect(compareCard).toContainText(
      "Adding Toast at 1.5× the logged portion.",
    );
    await expect(compareCard).toContainText("Calories0 kcal450 kcal+450 kcal");

    await insights
      .choice(compareCard, "Change type")
      .selectOption("Replace one logged food");
    await insights.button(compareCard, "1×").click();
    await insights
      .choice(compareCard, "Food being replaced")
      .selectOption({ index: 0 });
    await insights.choice(compareCard, "Replacement food").selectOption({
      label: `Toast · 1 serving · ${shortDayLabel(daysAgo(9))}`,
    });
    await expect(compareCard).toContainText(
      "Replacing Eggs with Toast at 1× the logged portion.",
    );
    await expect(compareCard).toContainText(
      "Calories500 kcal300 kcal-200 kcal",
    );
    await expect(today.calorieTotal(400)).toBeVisible();

    const sourceCard = insights.card("Where a nutrient comes from");

    await expect(sourceCard).toContainText("13 g known");
    await expect(sourceCard).toContainText(
      "Eggs provides 77% of known recorded fiber",
    );
    await expect(sourceCard).toContainText(
      "Eggs10 g · 77% · 2 portions · 2 days",
    );
    await expect(sourceCard).toContainText(
      "Toast3 g · 23% · 1 portion · 1 day",
    );
    await expect(sourceCard).not.toContainText("Hypothetical exclusion");

    await insights.excludeButton(0).click();

    await expect(sourceCard).toContainText("Hypothetical exclusion");
    await expect(sourceCard).toContainText(
      "Removing this source from the calculation leaves 3 g recorded known fiber. Records are unchanged; this is a what-if view.",
    );
    await expect(sourceCard).toContainText("Source amount10 g");
    await insights.excludeButton(1).click();
    await expect(sourceCard).toContainText("leaves 10 g recorded known fiber.");

    await insights.choice(sourceCard, "Nutrient").selectOption("Sodium");
    await expect(sourceCard).toContainText(
      "Eggs provides 83% of known recorded sodium",
    );
    await expect(sourceCard).not.toContainText("Hypothetical exclusion");
    await insights.button(sourceCard, "14 days").click();
    await expect(sourceCard).toContainText("3 of 3 item values known");
    await page.reload();
    await expect(today.entry("Oats")).toBeVisible();
    await expect(today.calorieTotal(400)).toBeVisible();
  });
});
