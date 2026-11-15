import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "./today-page-object.js";

// Each time is close to midnight in its zone, so the entry falls on another
// day in UTC: the evening in Honolulu (UTC-10) is the next morning in UTC, and
// just after midnight in Auckland (UTC+13) is the evening before in UTC.
const CASES = [
  { timezoneId: "Pacific/Honolulu", time: "23:30" },
  { timezoneId: "Pacific/Auckland", time: "00:30" },
];

for (const { timezoneId, time } of CASES) {
  test.describe(`entries logged in ${timezoneId}`, () => {
    test.use({ timezoneId });

    test("should stay on the local day with the local time that the owner entered", async ({
      page,
    }) => {
      const today = new TodayPageObject(page);
      await today.goto();
      const heading = await today.dayHeading.innerText();

      await today.addEntry({ name: "Border snack", calories: 210, time });

      await expect(today.entry("Border snack")).toContainText(time);
      await expect(today.calorieTotal(210)).toBeVisible();
      await page.reload();
      await expect(today.dayHeading).toHaveText(heading);
      await expect(today.entry("Border snack")).toContainText(time);
      await expect(today.calorieTotal(210)).toBeVisible();
      await today.goToPreviousDay();
      await expect(today.entry("Border snack")).toHaveCount(0);
      await expect(today.emptyDayNotice()).toBeVisible();
    });
  });
}
