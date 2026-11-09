import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "./today-page-object.js";

/** The type that the form suggests for a time of day. */
function suggestedType(time: string): string {
  const hour = Number(time.slice(0, 2));
  if (hour >= 4 && hour < 11) {
    return "breakfast";
  }
  if (hour >= 11 && hour < 15) {
    return "lunch";
  }
  if (hour >= 17 && hour < 22) {
    return "dinner";
  }
  return "snack";
}

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
    await expect(macros).toContainText("Carbs48.5 g");
    await expect(macros).toContainText("Fat7.75 g");
  });

  test("should keep the entry after a reload", async ({ page }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Apple", calories: 95 });

    await page.reload();

    await expect(today.entry("Apple")).toBeVisible();
  });

  test("should show the description only when it differs from the name", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();

    await today.addEntry({ name: "Soup", description: "Soup", calories: 150 });
    await today.addEntry({ name: "Salad", description: "SALAD", calories: 90 });
    await today.addEntry({
      name: "Stew",
      description: "Leftovers from Friday",
      calories: 400,
    });

    await expect(
      today.entryText("Stew", "Leftovers from Friday"),
    ).toBeVisible();
    await expect(today.entryText("Soup", "Soup")).toHaveCount(1);
    await expect(today.entryText("Salad", "SALAD")).toHaveCount(0);
  });

  test("should suggest the type for the time, and use the type that the owner picks", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.openEntryForm();

    const time = await today.entryFormField("Entry time").inputValue();
    await expect(today.entryFormField("Entry type")).toHaveValue(
      suggestedType(time),
    );

    await today.fillEntryForm({
      name: "Early dinner",
      calories: 400,
      time: "12:00",
      type: "Dinner",
    });
    await today.saveEntryForm();

    await expect(today.entry("Early dinner")).toContainText("Dinner");
  });

  test("should keep a blank nutrient unknown and a zero nutrient at zero", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();

    await today.addEntry({
      name: "Bran flakes",
      calories: 210,
      nutrients: { Fiber: 6.5, Sodium: 0 },
    });
    await page.reload();
    await today.openNutritionDetails("Bran flakes");

    const entry = today.entry("Bran flakes");
    await expect(entry).toContainText("Fiber 6.5 g");
    await expect(entry).toContainText("Sodium 0 mg");
    await expect(entry).toContainText("Calcium —");
  });

  test("should not save an entry without a name or calories", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.openEntryForm();

    await today.saveEntryForm();
    await expect(today.addEntryForm).toBeVisible();
    await today.entryFormField("Entry name").fill("Plain rice");
    await today.saveEntryForm();
    await expect(today.addEntryForm).toBeVisible();

    await today.entryFormField("Calories").fill("200");
    await today.saveEntryForm();

    await expect(today.entry("Plain rice")).toBeVisible();
    await expect(today.entriesPanel).toContainText("Entries 1");
  });
});
