import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import {
  daysAgo,
  TodayPageObject,
} from "../../entries/black-box-tests/today-page-object.js";

test.describe("the day arrows", () => {
  test("should go from the recent days to older days and back", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await expect(today.nextDayButton).toBeDisabled();

    await today.goToPreviousDay(8);
    await expect(today.dayHeadingOf(daysAgo(8))).toBeVisible();
    await today.addEntry({
      name: "Older dinner",
      time: "19:00",
      calories: 640,
      protein: 41,
    });
    await expect(today.calorieTotal(640)).toBeVisible();

    await today.goToPreviousDay();
    await expect(today.dayHeadingOf(daysAgo(9))).toBeVisible();
    await expect(today.emptyDayNotice()).toBeVisible();

    await today.goToNextDay(2);
    await expect(today.dayHeadingOf(daysAgo(7))).toBeVisible();
    await expect(today.entry("Older dinner")).toHaveCount(0);
    await today.goToNextDay();
    await expect(today.dayHeadingOf(daysAgo(6))).toBeVisible();
    await expect(
      today.recentDayButton(daysAgo(6), { pressed: true }),
    ).toBeVisible();
  });
});
