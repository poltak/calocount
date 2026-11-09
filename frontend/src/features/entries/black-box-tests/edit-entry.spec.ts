import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "./today-page-object.js";

const LUNCH = {
  name: "Audit lunch",
  calories: 500,
  protein: 30,
  carbs: 50,
  fat: 20,
  time: "12:30",
  type: "Lunch",
};

test.describe("the owner edits an entry", () => {
  test("should change the values of the entry and the totals of the day", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry(LUNCH);
    await expect(today.calorieTotal(500)).toBeVisible();

    await today.changeEntry("Audit lunch", {
      calories: 650,
      protein: 41,
      carbs: 60,
      fat: 25,
    });

    await expect(today.calorieTotal(650)).toBeVisible();
    await expect(today.proteinTotal(41)).toBeVisible();
    const macros = today.entryMacros("Audit lunch");
    await expect(macros).toContainText("Energy650 kcal");
    await expect(macros).toContainText("Carbs60 g");
    await expect(macros).toContainText("Fat25 g");
    await page.reload();
    await expect(today.calorieTotal(650)).toBeVisible();
  });

  test("should change the name and the description of the entry", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry(LUNCH);

    await today.changeEntry("Audit lunch", {
      name: "Team lunch",
      description: "Lunch at the audit",
    });

    await expect(
      today.entryText("Team lunch", "Lunch at the audit"),
    ).toBeVisible();
    await expect(today.entry("Audit lunch")).toHaveCount(0);
  });

  test("should change the type of the entry, and show no type for an entry without one", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({ ...LUNCH, name: "Midday meal" });
    await expect(today.entry("Midday meal")).toContainText("Lunch");

    await today.changeEntry("Midday meal", { type: "Breakfast" });
    await expect(today.entry("Midday meal")).toContainText("Breakfast");

    await today.changeEntry("Midday meal", { type: "Not set" });
    await expect(today.entry("Midday meal")).not.toContainText(
      /Breakfast|Lunch|Dinner|Snack/,
    );
  });

  test("should let the owner clear a total and type it again", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry(LUNCH);
    await today.editEntry("Audit lunch");
    const calories = today.entryEditorField("Audit lunch", "Calories");

    await calories.fill("");
    await expect(calories).toHaveValue("");
    await calories.pressSequentially("250");
    await expect(calories).toHaveValue("250");
    await today.saveEntryEditor("Audit lunch");

    await expect(today.calorieTotal(250)).toBeVisible();
  });

  test("should leave the entry as it was when the owner cancels the edit", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry(LUNCH);

    await today.editEntry("Audit lunch");
    await today.fillEntryEditor("Audit lunch", { calories: 999 });
    await today.entryButton("Audit lunch", "Cancel").click();

    await expect(today.entryButton("Audit lunch", "Save changes")).toBeHidden();
    await expect(today.calorieTotal(500)).toBeVisible();
  });
});

test.describe("the owner deletes an entry", () => {
  test("should remove the entry after the owner confirms, and update the totals and the trend", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry(LUNCH);
    const trendDay = today.trendDays("Calorie trend", /: 500 kilocalories$/);
    await expect(trendDay).toHaveCount(1);

    await today.deleteEntry("Audit lunch", { confirm: true });

    await expect(today.calorieTotal(0)).toBeVisible();
    await expect(trendDay).toHaveCount(0);
    await page.reload();
    await expect(today.emptyDayNotice()).toBeVisible();
  });

  test("should keep the entry when the owner declines the confirmation", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry(LUNCH);

    await today.deleteEntry("Audit lunch", { confirm: false });

    await expect(today.entry("Audit lunch")).toBeVisible();
    await expect(today.entryButton("Audit lunch", "Delete")).toBeEnabled();
    await expect(today.calorieTotal(500)).toBeVisible();
  });
});
