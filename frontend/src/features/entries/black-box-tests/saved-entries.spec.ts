import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "./today-page-object.js";

test.describe("the owner keeps saved entries", () => {
  test("should save an entry, track it again today, and remove it", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Audit lunch", calories: 500, protein: 30 });
    await expect(today.savedEntriesPanel).toContainText("No saved entries yet");

    await today.saveEntryForLater("Audit lunch");

    await expect(today.savedEntriesPanel).toContainText("Audit lunch");
    await expect(today.savedEntriesPanel).toContainText(
      "500 kcal · 30g protein",
    );
    await expect(today.savedEntriesPanel).toContainText("Saved entries 1");
    await expect(today.savedEntryButton("Audit lunch")).toHaveText("Saved");
    await expect(today.savedEntryButton("Audit lunch")).toBeDisabled();
    await expect(today.calorieTotal(500)).toBeVisible();

    await today.trackSavedEntry();

    await expect(today.entry("Audit lunch")).toHaveCount(2);
    await expect(today.calorieTotal(1000)).toBeVisible();

    await today.removeSavedEntry();

    await expect(today.savedEntriesPanel).toContainText("No saved entries yet");
    await expect(today.entry("Audit lunch")).toHaveCount(2);
    await page.reload();
    await expect(today.savedEntriesPanel).toContainText("No saved entries yet");
  });

  test("should keep a saved entry after a reload", async ({ page }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Granola bar", calories: 190, protein: 4 });
    await today.saveEntryForLater("Granola bar");
    await expect(today.savedEntriesPanel).toContainText("Saved entries 1");

    await page.reload();

    await expect(today.savedEntriesPanel).toContainText("Saved entries 1");
    await expect(today.savedEntriesPanel).toContainText(
      "190 kcal · 4g protein",
    );
    await expect(today.savedEntryButton("Granola bar")).toBeDisabled();
  });

  test("should keep a saved entry as it was after its source entry changes and goes", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Audit lunch", calories: 500, protein: 30 });
    await today.saveEntryForLater("Audit lunch");

    await today.changeEntry("Audit lunch", { calories: 700 });
    await today.deleteEntry("Audit lunch", { confirm: true });

    await expect(today.savedEntriesPanel).toContainText(
      "500 kcal · 30g protein",
    );
    await today.trackSavedEntry();
    await expect(today.entryMacros("Audit lunch")).toContainText(
      "Energy500 kcal",
    );
  });
});
