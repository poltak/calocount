import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "./today-page-object.js";

test.describe("the owner logs an entry", () => {
  test("should show a new entry with its time and values in the day's list", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();

    await today.addEntry({
      name: "Oat porridge",
      description: "Oats with milk",
      time: "08:15",
      calories: 312.5,
      protein: 12.25,
      carbs: 48.5,
      fat: 7.75,
    });

    const entry = today.entry("Oat porridge");
    await expect(entry).toContainText("08:15");
    await expect(entry).toContainText("Oats with milk");
    const macros = today.entryMacros("Oat porridge");
    await expect(macros).toContainText("Energy312.5 kcal");
    await expect(macros).toContainText("Protein12.25 g");
  });

  test("should keep the entry after a reload", async ({ page }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Apple", calories: 95 });

    await page.reload();

    await expect(today.entry("Apple")).toBeVisible();
  });
});
