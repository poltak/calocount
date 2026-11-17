import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import {
  TodayPageObject,
  daysAgo,
  shortDayLabel,
} from "../../entries/black-box-tests/today-page-object.js";
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

test.describe("food sources", () => {
  test("should rank the foods of the last 7 days with their share and add up repeated foods, then include older days on a 30-day range and rank by another measure", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    await logFoods(today);

    const panel = insights.panel("Food sources");
    const rows = insights.foodSourceRows();
    await expect(rows).toHaveCount(2);
    await expect(panel).toContainText(
      "1400 kcal known · 3 of 3 item values known",
    );
    await expect(rows.nth(0)).toContainText("Eggs");
    await expect(rows.nth(0)).toContainText("2 entries");
    await expect(rows.nth(0)).toContainText("1000 kcal");
    await expect(rows.nth(0)).toContainText("71%");
    await expect(rows.nth(1)).toContainText("Oats");
    await expect(rows.nth(1)).toContainText("1 entry");
    await expect(rows.nth(1)).toContainText("400 kcal");
    await expect(rows.nth(1)).toContainText("29%");

    await insights.button(panel, "30 days").click();

    await expect(rows).toHaveCount(3);
    await expect(panel).toContainText(
      "1700 kcal known · 4 of 4 item values known",
    );
    await expect(rows.nth(0)).toContainText("Eggs");
    await expect(rows.nth(0)).toContainText("59%");
    await expect(rows.nth(2)).toContainText("Toast");
    await expect(rows.nth(2)).toContainText("300 kcal");
    await expect(rows.nth(2)).toContainText("18%");

    await insights.choice(panel, "Measure").selectOption({ label: "Fiber" });

    await expect(panel).toContainText("13 g known · 4 of 4 item values known");
    await expect(rows.nth(0)).toContainText("Oats");
    await expect(rows.nth(0)).toContainText("8 g");
    await expect(rows.nth(0)).toContainText("62%");
    await expect(rows.nth(1)).toContainText("Toast");
    await expect(rows.nth(1)).toContainText("3 g");
    await expect(rows.nth(2)).toContainText("Eggs");
    await expect(rows.nth(2)).toContainText("2 g");

    await insights.choice(panel, "Measure").selectOption({ label: "Sodium" });

    await expect(panel).toContainText("No sodium data in this range");
  });

  test("should list the entries of a food when its row is opened, and hide them when it is closed", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    await logFoods(today);

    const eggs = insights.foodSource("Eggs");
    await expect(eggs).toHaveAttribute("aria-expanded", "false");
    await expect(insights.foodSourceEntries("Eggs")).toHaveCount(0);

    await insights.toggleFoodSource("Eggs");

    await expect(eggs).toHaveAttribute("aria-expanded", "true");
    const entries = insights.foodSourceEntries("Eggs");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText(shortDayLabel(daysAgo(1)));
    await expect(entries.nth(0)).toContainText("1 serving");
    await expect(entries.nth(0)).toContainText("500 kcal");
    await expect(entries.nth(1)).toContainText(shortDayLabel(daysAgo(2)));

    await insights.toggleFoodSource("Eggs");

    await expect(eggs).toHaveAttribute("aria-expanded", "false");
    await expect(entries).toHaveCount(0);
  });
});
