import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
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
