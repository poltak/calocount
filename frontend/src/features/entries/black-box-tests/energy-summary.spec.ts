import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { DashboardPanelsPageObject } from "./dashboard-panels-page-object.js";
import {
  daysAgo,
  shortDayLabel,
  TodayPageObject,
} from "./today-page-object.js";

test.describe("the weight card", () => {
  test("should say how the weight changed since the first weight, and what the maintenance estimate needs", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const panels = new DashboardPanelsPageObject(page);
    await today.goto();
    await expect(panels.weightCard).toContainText(
      "The change shows after a week of weights",
    );
    await expect(panels.weightCard).toContainText(
      "Maintenance estimate needs 3 weeks of logs and weights",
    );

    await today.goToPreviousDay(8);
    await today.saveWeight(76, { editing: false });
    await today.goToNextDay(8);
    await today.saveWeight(75, { editing: false });

    await expect(panels.weightCard).toContainText("75 kg");
    await expect(panels.weightCard).toContainText(
      `−1 kg since ${shortDayLabel(daysAgo(8))}`,
    );
    await expect(panels.maintenanceEstimate).toBeHidden();
  });
});

test.describe("the last 4 weeks panel", () => {
  test("should show the fat share, the saturated fat days and the fiber of the logged days", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const panels = new DashboardPanelsPageObject(page);
    await today.goto();
    await expect(panels.lastFourWeeksPanel).toContainText(
      "Not enough logged days yet",
    );

    await today.logHistory(
      [1, 2, 3, 4, 5, 6, 7].map((count) => ({
        daysAgo: count,
        entry: {
          name: `Meal ${count}`,
          calories: 1000,
          fat: 50,
          nutrients: { Fiber: 20, "Saturated fat": 25 },
        },
      })),
    );

    await expect(panels.lastFourWeeksPanel).toContainText(
      "Fat 45% of calories",
    );
    await expect(panels.lastFourWeeksPanel).toContainText(
      "Saturated fat over the 20 g limit on 7 of 7 logged days",
    );
    await expect(panels.lastFourWeeksPanel).toContainText(
      "Fiber 20 g a day · goal 28 g",
    );
    await expect(panels.lastFourWeeksPanel).not.toContainText(
      "in the 4 weeks before",
    );
  });
});
