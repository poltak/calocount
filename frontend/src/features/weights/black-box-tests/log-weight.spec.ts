import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import {
  daysAgo,
  TodayPageObject,
} from "../../entries/black-box-tests/today-page-object.js";

test.describe("the owner logs a weight", () => {
  test("should show the weight of the day and when it was saved", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await expect(today.weightPanel).toContainText("No weight recorded");

    await today.saveWeight(71.4, { editing: false });

    await expect(today.weightPanel).toContainText("71.4 kg");
    await expect(today.weightPanel).toContainText(/Saved at \d{1,2}:\d{2}/);
    await page.reload();
    await expect(today.weightPanel).toContainText("71.4 kg");
  });

  test("should change the weight of an earlier day while that day stays selected", async ({
    page,
  }) => {
    const earlier = daysAgo(1);
    const today = new TodayPageObject(page);
    await today.goto();
    await today.goToPreviousDay();
    await today.saveWeight(70, { editing: false });
    await expect(today.weightPanel).toContainText("70 kg");

    await today.saveWeight(72, { editing: true });

    await expect(today.dayHeadingOf(earlier)).toBeVisible();
    await expect(today.weightPanel).toContainText("72 kg");
    await today.goToNextDay();
    await expect(today.weightPanel).toContainText("No weight recorded");
  });
});
