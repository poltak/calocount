import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { DashboardPanelsPageObject } from "./dashboard-panels-page-object.js";
import { TodayPageObject, daysAgo } from "./today-page-object.js";

test.describe("the recent days panel", () => {
  test("should list the recent days with their calories, count the logging streak, and open a day", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const panels = new DashboardPanelsPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Oats", calories: 400 });
    await today.logHistory([
      { daysAgo: 1, entry: { name: "Eggs", calories: 500 } },
      { daysAgo: 3, entry: { name: "Toast", calories: 600 } },
    ]);

    await expect(panels.recentDayRow(daysAgo(0))).toContainText("400 kcal");
    await expect(panels.recentDayRow(daysAgo(1))).toContainText("500 kcal");
    await expect(panels.recentDayRow(daysAgo(2))).toContainText("0 kcal");
    await expect(panels.recentDayRow(daysAgo(3))).toContainText("600 kcal");
    await expect(panels.recentDayRow(daysAgo(4))).toBeHidden();
    await expect(panels.loggingStreak).toHaveText("2 days logging streak");

    await panels.recentDayRow(daysAgo(3)).click();

    await expect(today.dayHeadingOf(daysAgo(3))).toBeVisible();
    await expect(today.entry("Toast")).toBeVisible();
    await expect(panels.loggingStreak).toHaveText("1 day logging streak");

    await panels.recentDayRow(daysAgo(2)).click();

    await expect(today.dayHeadingOf(daysAgo(2))).toBeVisible();
    await expect(panels.loggingStreak).toHaveText("0 days logging streak");
  });

  test("should list all seven days after View all, and the four latest after Less", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const panels = new DashboardPanelsPageObject(page);
    await today.goto();

    await expect(panels.recentDaysToggle).toHaveText("View all");
    await expect(panels.recentDayRow(daysAgo(5))).toBeHidden();

    await panels.recentDaysToggle.click();

    await expect(panels.recentDaysToggle).toHaveText("Less");
    await expect(panels.recentDayRow(daysAgo(6))).toBeVisible();
    await expect(panels.recentDayRow(daysAgo(4))).toBeVisible();

    await panels.recentDaysToggle.click();

    await expect(panels.recentDayRow(daysAgo(6))).toBeHidden();
    await expect(panels.recentDayRow(daysAgo(3))).toBeVisible();
  });
});
