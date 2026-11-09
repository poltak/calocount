import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import {
  daysAgo,
  shortDayLabel,
  TodayPageObject,
} from "../../entries/black-box-tests/today-page-object.js";

test.describe("the macros trend", () => {
  test("should show the split of each day and mark days without data", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await expect(
      today.emptyTrendNotice("No macro records for the past 7 days"),
    ).toBeVisible();

    // 50 g carbs, 30 g protein and 20 g fat are 200, 120 and 180 of 500 kcal.
    await today.addEntry({
      name: "Audit lunch",
      calories: 500,
      protein: 30,
      carbs: 50,
      fat: 20,
    });

    await expect(
      today.trendDay("Macros trend", daysAgo(0)),
    ).toHaveAccessibleName(
      `${shortDayLabel(daysAgo(0))}: 40% carbohydrates, 24% protein, 36% fat`,
    );
    await expect(
      today.trendDays("Macros trend", /: no macro data$/),
    ).toHaveCount(6);
  });
});
