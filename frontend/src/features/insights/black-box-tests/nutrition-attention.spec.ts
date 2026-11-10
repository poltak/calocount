import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import {
  TodayPageObject,
  daysAgo,
} from "../../entries/black-box-tests/today-page-object.js";
import { InsightsPageObject } from "./insights-page-object.js";

test.describe("nutrition attention", () => {
  test("should list the high days of a nutrient with the reference, and the sources of the selected day", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    await today.goto();
    await today.logHistory([
      {
        daysAgo: 1,
        entry: {
          name: "Salty eggs",
          calories: 500,
          nutrients: { Sodium: 2500 },
        },
      },
      {
        daysAgo: 1,
        entry: {
          name: "Soy noodles",
          calories: 300,
          nutrients: { Sodium: 500 },
        },
      },
      {
        daysAgo: 2,
        entry: {
          name: "Plain rice",
          calories: 200,
          nutrients: { Sodium: 400 },
        },
      },
    ]);
    await insights.showNutrition();
    const panel = insights.panel("Nutrition attention");

    await expect(panel).toContainText("2 of 14 days have logs");
    await expect(panel).toContainText("1 of 2 observed days above 2,300 mg");
    await expect(panel).toContainText("Maximum recorded3,000 mg");
    await expect(insights.excessDay(daysAgo(1))).toContainText("above");
    await expect(insights.excessDay(daysAgo(2))).toContainText("within");
    await expect(panel).toContainText("Salty eggs2,500 mg · 83%");
    await expect(panel).toContainText("Soy noodles500 mg · 17%");

    await insights.excessDay(daysAgo(2)).click();

    await expect(panel).toContainText("Plain rice400 mg · 100%");
    await expect(panel).toContainText(
      "Nov 8: 400 mg, within 2,300 mg. Known contributions below",
    );
  });

  test("should name the reference for the chosen nutrient and the limits of what the data says", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    await today.goto();
    await today.logHistory([
      {
        daysAgo: 1,
        entry: { name: "Cheese", calories: 300, nutrients: { Sodium: 700 } },
      },
    ]);
    await insights.showNutrition();
    const panel = insights.panel("Nutrition attention");

    await expect(panel).toContainText("Sodium guideline · 2,300 mg");
    await insights
      .choice(panel, "Select excess nutrient")
      .selectOption({ label: "Saturated fat · saturated fat guideline" });

    await expect(panel).toContainText(
      "Finished days above the saturated fat guideline",
    );
    await expect(panel).toContainText("Total sugars");
    await expect(panel).toContainText("0 complete of 1 logged days");
    await expect(panel).toContainText(
      "They do not measure nutrient status in the body or establish deficiency, toxicity, or medical risk.",
    );
  });
});
