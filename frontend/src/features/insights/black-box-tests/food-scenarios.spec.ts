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
  test("should compare adding or replacing a logged food without changing the totals", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    await logFoods(today);
    await insights.showNutrition();
    const card = insights.card("Compare a food change");

    await expect(card).toContainText("Adding Eggs at 1× the logged portion.");
    await expect(card).toContainText("Calories0 kcal500 kcal+500 kcal");
    await insights.button(card, "1.5×").click();
    await expect(card).toContainText("Adding Eggs at 1.5× the logged portion.");
    await expect(card).toContainText("Calories0 kcal750 kcal+750 kcal");
    await insights
      .choice(card, "Food to add")
      .selectOption(`Toast · 1 serving · ${shortDayLabel(daysAgo(9))}`);
    await expect(card).toContainText(
      "Adding Toast at 1.5× the logged portion.",
    );
    await expect(card).toContainText("Calories0 kcal450 kcal+450 kcal");

    await insights
      .choice(card, "Change type")
      .selectOption("Replace one logged food");
    await insights.button(card, "1×").click();
    await insights
      .choice(card, "Food being replaced")
      .selectOption({ index: 0 });
    await insights.choice(card, "Replacement food").selectOption({
      label: `Toast · 1 serving · ${shortDayLabel(daysAgo(9))}`,
    });
    await expect(card).toContainText(
      "Replacing Eggs with Toast at 1× the logged portion.",
    );
    await expect(card).toContainText("Calories500 kcal300 kcal-200 kcal");
    await expect(today.calorieTotal(400)).toBeVisible();
  });

  test("should show how an excluded food source changes a nutrient, and leave the records unchanged", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    await logFoods(today);
    await insights.showNutrition();
    const card = insights.card("Where a nutrient comes from");

    await expect(card).toContainText("13 g known");
    await expect(card).toContainText(
      "Eggs provides 77% of known recorded fiber",
    );
    await expect(card).toContainText("Eggs10 g · 77% · 2 portions · 2 days");
    await expect(card).toContainText("Toast3 g · 23% · 1 portion · 1 day");
    await expect(card).not.toContainText("Hypothetical exclusion");

    await insights.excludeButton(0).click();

    await expect(card).toContainText("Hypothetical exclusion");
    await expect(card).toContainText(
      "Removing this source from the calculation leaves 3 g recorded known fiber. Records are unchanged; this is a what-if view.",
    );
    await expect(card).toContainText("Source amount10 g");
    await insights.excludeButton(1).click();
    await expect(card).toContainText("leaves 10 g recorded known fiber.");

    await insights.choice(card, "Nutrient").selectOption("Sodium");
    await expect(card).toContainText(
      "Eggs provides 83% of known recorded sodium",
    );
    await expect(card).not.toContainText("Hypothetical exclusion");
    await insights.button(card, "14 days").click();
    await expect(card).toContainText("3 of 3 item values known");
    await page.reload();
    await expect(today.entry("Oats")).toBeVisible();
    await expect(today.calorieTotal(400)).toBeVisible();
  });
});
