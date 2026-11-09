import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import {
  daysAgo,
  shortDayLabel,
  TodayPageObject,
} from "../../entries/black-box-tests/today-page-object.js";

test.describe("the weight trend", () => {
  test("should show recorded days and leave the other days as gaps", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await expect(
      today.emptyTrendNotice("No weight records for the past 7 days"),
    ).toBeVisible();

    await today.goToPreviousDay(2);
    await today.saveWeight(69, { editing: false });
    await today.goToNextDay(2);
    await today.saveWeight(70, { editing: false });
    await page.reload();

    const days = today.trendDays("Weight trend");
    await expect(days).toHaveCount(7);
    await expect(
      today.trendDay("Weight trend", daysAgo(2)),
    ).toHaveAccessibleName(`${shortDayLabel(daysAgo(2))}: 69 kilograms`);
    await expect(
      today.trendDay("Weight trend", daysAgo(0)),
    ).toHaveAccessibleName(`${shortDayLabel(daysAgo(0))}: 70 kilograms`);
    await expect(
      today.trendDays("Weight trend", /: no weight recorded$/),
    ).toHaveCount(5);
  });
});
