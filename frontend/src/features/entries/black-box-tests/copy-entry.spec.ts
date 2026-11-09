import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "./today-page-object.js";

const SOUP = { name: "Yesterday soup", calories: 300, protein: 12 };

test.describe("the owner copies an entry", () => {
  test("should offer the copy to today only on an older day", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry(SOUP);
    await expect(
      today.entryButton("Yesterday soup", "Duplicate"),
    ).toBeVisible();
    await expect(
      today.entryButton("Yesterday soup", "Copy to today"),
    ).toHaveCount(0);

    await today.goToPreviousDay();
    await today.addEntry({ ...SOUP, name: "Older soup" });

    await expect(
      today.entryButton("Older soup", "Copy to today"),
    ).toBeVisible();
    await expect(today.entryButton("Older soup", "Duplicate")).toBeVisible();
  });

  test("should copy an entry from an older day to today and keep the original", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.goToPreviousDay();
    await today.addEntry(SOUP);

    await today.copyEntryToToday("Yesterday soup");

    await expect(today.entry("Yesterday soup")).toBeVisible();
    await today.goToNextDay();
    await expect(today.entry("Yesterday soup")).toBeVisible();
    await expect(today.calorieTotal(300)).toBeVisible();
    await expect(today.proteinTotal(12)).toBeVisible();
    await expect(
      today.trendDays("Calorie trend", /: 300 kilocalories$/),
    ).toHaveCount(2);
  });

  test("should duplicate an entry on the same day and add its values to the totals", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry(SOUP);

    await today.duplicateEntry("Yesterday soup");

    await expect(today.entry("Yesterday soup")).toHaveCount(2);
    await expect(today.calorieTotal(600)).toBeVisible();
    await expect(today.proteinTotal(24)).toBeVisible();
    await page.reload();
    await expect(today.entry("Yesterday soup")).toHaveCount(2);
  });
});
