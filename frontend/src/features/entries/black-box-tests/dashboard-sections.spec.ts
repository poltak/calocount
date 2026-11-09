import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "./today-page-object.js";

test.describe("the sections of the owner dashboard", () => {
  test("should show section tabs on a small screen that follow the URL hash", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await expect(today.sectionTabs).toBeHidden();

    await page.setViewportSize({ width: 600, height: 900 });
    await expect(today.sectionTabs).toBeVisible();
    await expect(today.sectionTab("Today")).toHaveAttribute(
      "aria-current",
      "page",
    );

    await today.sectionTab("Entries").click();
    await expect(page).toHaveURL(/#meals$/);
    await expect(today.sectionTab("Entries")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(today.sectionTab("Today")).not.toHaveAttribute(
      "aria-current",
      "page",
    );

    for (const [tab, hash] of [
      ["Trend", "trend"],
      ["Macros", "macros"],
      ["Nutrition", "nutrition"],
    ] as const) {
      await today.gotoSection(hash);
      await expect(today.sectionTab(tab)).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
  });

  test("should collapse the nutrition section and keep the choice after a reload", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await expect(today.nutritionOverview).toBeVisible();
    await expect(today.trendPanel("Nutrient trend")).toBeVisible();

    await today.nutritionHideButton.click();

    await expect(today.nutritionShowButton).toBeVisible();
    await expect(today.nutritionOverview).toBeHidden();

    await page.reload();
    await expect(today.nutritionShowButton).toBeVisible();
    await expect(today.nutritionOverview).toBeHidden();

    await today.nutritionShowButton.click();
    await expect(today.nutritionOverview).toBeVisible();
    await expect(today.trendPanel("Nutrient trend")).toBeVisible();
  });

  test("should list the items of an entry in its nutrition details", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({
      name: "Lentil soup",
      calories: 280,
      nutrients: { Fiber: 4 },
    });
    await expect(today.nutritionDetailsOf("Lentil soup")).toBeHidden();

    await today.openNutritionDetails("Lentil soup");

    const entry = today.entry("Lentil soup");
    await expect(entry).toContainText("1 item");
    await expect(entry).toContainText("1 serving");
    await expect(entry).toContainText("Fiber 4 g");
    await expect(entry).toContainText("Caffeine —");

    await today.closeNutritionDetails("Lentil soup");
    await expect(today.nutritionDetailsOf("Lentil soup")).toBeHidden();
  });
});
