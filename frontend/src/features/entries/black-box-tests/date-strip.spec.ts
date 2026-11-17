import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { DashboardPanelsPageObject } from "./dashboard-panels-page-object.js";
import { fullDayLabel, TodayPageObject, daysAgo } from "./today-page-object.js";

test.describe("the date strip", () => {
  test("should show the calories of each day with entries, and open a day", async ({
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

    await expect(panels.dayPill(daysAgo(0))).toContainText("400");
    await expect(panels.dayPill(daysAgo(1))).toContainText("500");
    await expect(panels.dayPill(daysAgo(3))).toContainText("600");
    await expect(panels.dayPill(daysAgo(2))).toHaveAccessibleName(
      fullDayLabel(daysAgo(2)),
    );

    await panels.dayPill(daysAgo(3)).click();

    await expect(today.dayHeadingOf(daysAgo(3))).toBeVisible();
    await expect(today.entry("Toast")).toBeVisible();
  });

  test("should say if a day is under, near or over the calorie goal, and leave today open until it is over", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const panels = new DashboardPanelsPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Oats", calories: 400 });
    await today.logHistory([
      { daysAgo: 1, entry: { name: "Light", calories: 1200 } },
      { daysAgo: 2, entry: { name: "Goal", calories: 2400 } },
      { daysAgo: 3, entry: { name: "Feast", calories: 3000 } },
    ]);

    await expect(panels.dayPill(daysAgo(0))).toHaveAccessibleName(
      `${fullDayLabel(daysAgo(0))}, 400 calories so far`,
    );
    await expect(panels.dayPill(daysAgo(1))).toHaveAccessibleName(
      `${fullDayLabel(daysAgo(1))}, 1200 calories, under goal`,
    );
    await expect(panels.dayPill(daysAgo(2))).toHaveAccessibleName(
      `${fullDayLabel(daysAgo(2))}, 2400 calories, near goal`,
    );
    await expect(panels.dayPill(daysAgo(3))).toHaveAccessibleName(
      `${fullDayLabel(daysAgo(3))}, 3000 calories, over goal`,
    );

    await today.addEntry({ name: "Banquet", calories: 3000 });

    await expect(panels.dayPill(daysAgo(0))).toHaveAccessibleName(
      `${fullDayLabel(daysAgo(0))}, 3400 calories, over goal`,
    );
  });

  test("should fit a phone without a horizontal scroll of the page", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const panels = new DashboardPanelsPageObject(page);
    await page.setViewportSize({ width: 390, height: 800 });
    await today.goto();
    await today.addEntry({ name: "Oats", calories: 2178 });

    await expect(panels.dayPill(daysAgo(0))).toContainText("2178");
    for (const locator of [
      panels.dayPill(daysAgo(6)),
      panels.dayPill(daysAgo(0)),
      today.nextDayButton,
      today.calendarToggle,
    ]) {
      const box = await locator.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    }
  });
});

test.describe("the logging streak", () => {
  test("should show the days in a row that end today, from two days on", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const panels = new DashboardPanelsPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Oats", calories: 400 });
    await expect(panels.dayPill(daysAgo(0))).toContainText("400");
    await expect(panels.loggingStreak).toBeHidden();

    await today.logHistory([
      { daysAgo: 1, entry: { name: "Eggs", calories: 500 } },
      { daysAgo: 3, entry: { name: "Toast", calories: 600 } },
    ]);

    await expect(panels.loggingStreak).toHaveText("✦ 2-day logging streak");
    await panels.dayPill(daysAgo(3)).click();
    await expect(today.dayHeadingOf(daysAgo(3))).toBeVisible();
    await expect(panels.loggingStreak).toBeVisible();
  });

  test("should count back from yesterday while today has no entry", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const panels = new DashboardPanelsPageObject(page);
    await today.goto();

    await today.logHistory([
      { daysAgo: 1, entry: { name: "Eggs", calories: 500 } },
      { daysAgo: 2, entry: { name: "Toast", calories: 600 } },
      { daysAgo: 3, entry: { name: "Soup", calories: 300 } },
    ]);

    await expect(panels.loggingStreak).toHaveText("✦ 3-day logging streak");
  });
});
