import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import {
  daysAgo,
  TodayPageObject,
} from "../../entries/black-box-tests/today-page-object.js";

test.describe("entries on an older day", () => {
  test("should change an entry of an older day and add a new entry to that day", async ({
    page,
  }) => {
    test.slow();
    const older = daysAgo(35);
    const today = new TodayPageObject(page);
    await today.goto();
    await today.goToPreviousDay(35);
    await today.addEntry({
      name: "August dinner",
      time: "19:00",
      calories: 700,
      protein: 45,
    });

    await today.changeEntry("August dinner", { name: "August supper" });
    await expect(today.entry("August supper")).toBeVisible();
    await expect(today.dayHeadingOf(older)).toBeVisible();

    await today.addEntry({
      name: "Late addition",
      time: "08:15",
      calories: 300,
      protein: 20,
    });
    await expect(today.entry("Late addition")).toContainText("08:15");
    await expect(today.entriesPanel).toContainText("Entries 2");
    await expect(today.calorieTotal(1000)).toBeVisible();

    await page.reload();
    await today.openCalendar();
    await today.showCalendarMonth(older);
    await expect(today.calendarDay(older)).toHaveAccessibleName(
      /: 1,000 kilocalories, 65 grams of protein$/,
    );
  });
});
