import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { InsightsPageObject } from "./insights-page-object.js";

/** Oats today, eggs on two days, and toast nine days ago. */
async function logFoods(today: TodayPageObject) {
  await today.goto();
  await today.addEntry({
    name: "Oats",
    calories: 400,
    nutrients: { Fiber: 8 },
  });
  await today.logHistory([
    {
      daysAgo: 1,
      entry: { name: "Eggs", calories: 500, nutrients: { Fiber: 1 } },
    },
    {
      daysAgo: 2,
      entry: { name: "Eggs", calories: 500, nutrients: { Fiber: 1 } },
    },
    {
      daysAgo: 9,
      entry: { name: "Toast", calories: 300, nutrients: { Fiber: 3 } },
    },
  ]);
}

test.describe("top food contributors", () => {
  test("should rank the foods of the last 7 days by calories and add up repeated foods, then include older days on a 30-day range and rank by another measure", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    await logFoods(today);

    const rows = insights.contributionRows();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Eggs");
    await expect(rows.nth(0)).toContainText("2 entries");
    await expect(rows.nth(0)).toContainText("1,000 kcal");
    await expect(rows.nth(1)).toContainText("Oats");
    await expect(rows.nth(1)).toContainText("1 entry");
    await expect(rows.nth(1)).toContainText("400 kcal");
    await expect(insights.contributionBar(rows.nth(0))).toHaveAccessibleName(
      "100% of the top contributor",
    );
    await expect(insights.contributionBar(rows.nth(1))).toHaveAccessibleName(
      "40% of the top contributor",
    );

    const panel = insights.panel("Top food contributors");

    await insights.button(panel, "30 days").click();

    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Eggs");
    await expect(rows.nth(2)).toContainText("Toast");
    await expect(rows.nth(2)).toContainText("300 kcal");

    await insights.choice(panel, "Show").selectOption({ label: "Fiber" });

    await expect(rows.nth(0)).toContainText("Oats");
    await expect(rows.nth(0)).toContainText("8 g");
    await expect(rows.nth(1)).toContainText("Toast");
    await expect(rows.nth(1)).toContainText("3 g");
    await expect(rows.nth(2)).toContainText("Eggs");
    await expect(rows.nth(2)).toContainText("2 g");

    await insights.choice(panel, "Show").selectOption({ label: "Sodium" });

    await expect(panel).toContainText("No sodium data in this range");
  });
});
