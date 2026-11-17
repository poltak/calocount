import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { DashboardPanelsPageObject } from "../../entries/black-box-tests/dashboard-panels-page-object.js";
import {
  daysAgo,
  shortDayLabel,
  TodayPageObject,
} from "../../entries/black-box-tests/today-page-object.js";

test.describe("the owner logs a weight", () => {
  test("should show the weight of the day in the weight card, from the form of the weight trend", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const panels = new DashboardPanelsPageObject(page);
    await today.goto();
    await expect(panels.weightCard).toContainText("No weight yet");
    await expect(today.weightField).toBeHidden();

    await today.saveWeight(71.4, { editing: false });

    await expect(panels.weightCard).toContainText("71.4 kg");
    await expect(today.weightField).toBeHidden();
    await page.reload();
    await expect(panels.weightCard).toContainText("71.4 kg");
    await expect(today.editWeightButton).toBeVisible();
  });

  test("should change the weight of an earlier day while that day stays selected", async ({
    page,
  }) => {
    const earlier = daysAgo(1);
    const today = new TodayPageObject(page);
    const panels = new DashboardPanelsPageObject(page);
    await today.goto();
    await today.goToPreviousDay();
    await today.saveWeight(70, { editing: false });
    await expect(panels.weightCard).toContainText("70 kg");

    await today.saveWeight(72, { editing: true });

    await expect(today.dayHeadingOf(earlier)).toBeVisible();
    await expect(panels.weightCard).toContainText("72 kg");
    await today.goToNextDay();
    await expect(panels.weightCard).toContainText("72 kg");
    await expect(panels.weightCard).toContainText(
      `on ${shortDayLabel(earlier)}`,
    );
    await expect(today.addWeightButton).toBeVisible();
  });
});
