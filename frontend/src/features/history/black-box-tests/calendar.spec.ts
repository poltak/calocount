import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import {
  daysAgo,
  fullDayLabel,
  TodayPageObject,
} from "../../entries/black-box-tests/today-page-object.js";

test.describe("the calendar of past days", () => {
  test("should show the calories and protein of each day and open an older day", async ({
    page,
  }) => {
    test.slow();
    const older = daysAgo(35);
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Audit lunch", calories: 500, protein: 30 });
    await today.goToPreviousDay(35);
    await today.addEntry({
      name: "Late dinner",
      time: "19:00",
      calories: 700,
      protein: 45,
    });
    await today.addEntry({
      name: "Early breakfast",
      time: "08:00",
      calories: 350.4,
      protein: 20,
    });
    await today.goto();

    await today.openCalendar();
    await expect(
      today.calendarDay(daysAgo(0), { pressed: true }),
    ).toHaveAccessibleName(
      `${fullDayLabel(daysAgo(0))}: 500 kilocalories, 30 grams of protein`,
    );
    await expect(today.calendarNextMonthButton()).toBeDisabled();

    await today.showCalendarMonth(older);
    await expect(today.calendarDay(older)).toHaveAccessibleName(
      `${fullDayLabel(older)}: 1,050 kilocalories, 65 grams of protein`,
    );
    await expect(today.calendarPreviousMonthButton()).toBeDisabled();

    await today.calendarDay(older).click();
    await expect(today.calendar).toBeHidden();
    await expect(today.dayHeadingOf(older)).toBeVisible();
    await expect(today.entry("Late dinner")).toContainText("19:00");
    await expect(today.entry("Early breakfast")).toContainText("08:00");
    await expect(today.calorieTotal(1050)).toBeVisible();
    await expect(today.proteinTotal(65)).toBeVisible();
  });

  test("should open on the month of the day in view and close again", async ({
    page,
  }) => {
    test.slow();
    const older = daysAgo(35);
    const today = new TodayPageObject(page);
    await today.goto();
    await today.goToPreviousDay(35);
    await today.addEntry({ name: "Old supper", calories: 600, protein: 25 });

    await today.openCalendar();

    await expect(today.calendarDay(older, { pressed: true })).toBeVisible();
    await today.closeCalendar();
    await expect(today.calendar).toBeHidden();
  });
});
