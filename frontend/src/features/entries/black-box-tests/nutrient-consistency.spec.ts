import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { DashboardPanelsPageObject } from "./dashboard-panels-page-object.js";
import { TodayPageObject, daysAgo } from "./today-page-object.js";

test.describe("the nutrient consistency matrix", () => {
  test("should show each day against the goal of a nutrient, and a dash for a day without a value", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const panels = new DashboardPanelsPageObject(page);
    await today.goto();
    await today.logHistory([
      {
        daysAgo: 1,
        entry: {
          name: "Porridge",
          calories: 300,
          nutrients: { Fiber: 14, Sodium: 2530 },
        },
      },
      {
        daysAgo: 2,
        entry: {
          name: "Salad",
          calories: 200,
          nutrients: { Fiber: 30, Sodium: 1150 },
        },
      },
    ]);

    await expect(panels.consistencyPanel).toContainText("Nutrient consistency");
    await expect(panels.consistencyPanel).toContainText("goal 28 g");
    await expect(panels.consistencyPanel).toContainText("limit 2,300 mg");
    const below = panels.consistencyCell(daysAgo(1), "Fiber");
    await expect(below).toHaveAccessibleName(/14 g, 50% of goal$/);
    await expect(below).toHaveClass(/low/);
    await expect(below).toHaveText("50%");
    const met = panels.consistencyCell(daysAgo(2), "Fiber");
    await expect(met).toHaveAccessibleName(/30 g, 107% of goal$/);
    await expect(met).toHaveClass(/met/);
    const over = panels.consistencyCell(daysAgo(1), "Sodium");
    await expect(over).toHaveAccessibleName(/2,530 mg, 110% of limit$/);
    await expect(over).toHaveClass(/over/);
    const under = panels.consistencyCell(daysAgo(2), "Sodium");
    await expect(under).toHaveAccessibleName(/1,150 mg, 50% of limit$/);
    await expect(under).toHaveClass(/met/);
    const unknown = panels.consistencyCell(daysAgo(3), "Fiber");
    await expect(unknown).toHaveAccessibleName(/: unknown$/);
    await expect(unknown).toHaveText("—");
  });
});
