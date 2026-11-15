import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "./today-page-object.js";

test.describe("the owner records where a nutrient value came from", () => {
  test("should show the origin of each known value in the entry details", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();

    await today.addEntry({
      name: "Label granola",
      calories: 260,
      nutrients: { Fiber: 5, Sodium: 120, Calcium: 80, Iron: 2 },
      origins: {
        Fiber: "Nutrition label",
        Sodium: "Food database",
        Calcium: "AI estimate",
      },
    });
    await page.reload();
    await today.openNutritionDetails("Label granola");

    const entry = today.entry("Label granola");
    await expect(entry).toContainText("Fiber 5 gNutrition label");
    await expect(entry).toContainText("Sodium 120 mgFood database");
    await expect(entry).toContainText("Calcium 80 mgAI estimate");
    await expect(entry).toContainText("Iron 2 mgManual entry");
  });

  test("should show an unknown origin for a value that has none, and no origin for a blank value", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();

    await today.addEntry({
      name: "Plain bran",
      calories: 150,
      nutrients: { Fiber: 7 },
      origins: { Fiber: "Origin unknown" },
    });
    await today.openNutritionDetails("Plain bran");

    const entry = today.entry("Plain bran");
    await expect(entry).toContainText("Fiber 7 gOrigin unknown");
    await expect(entry).toContainText("Sodium —");
    await expect(entry).not.toContainText("Sodium —Origin");
  });
});
