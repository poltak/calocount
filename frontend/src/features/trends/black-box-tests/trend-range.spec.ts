import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";

const PANELS = [
  "Calorie trend",
  "Protein vs target",
  "Weight trend",
  "Macros trend",
  "Nutrient trend",
];
const RANGES = [
  "Calorie trend",
  "Protein versus target",
  "Weight trend",
  "Macros trend",
  "Nutrient trend",
];

test.describe("the trend range", () => {
  test("should apply the shared 7 or 30 day range to every trend panel", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({
      name: "Audit lunch",
      calories: 500,
      protein: 30,
      carbs: 50,
      fat: 20,
      nutrients: { Fiber: 4 },
    });
    await today.saveWeight(70, { editing: false });
    for (const panel of PANELS) {
      await expect(today.trendDays(panel)).toHaveCount(7);
    }

    await today.trendRange("Calorie trend").selectOption("30");
    for (const panel of PANELS) {
      await expect(today.trendDays(panel)).toHaveCount(30);
    }
    for (const range of RANGES) {
      await expect(today.trendRange(range)).toHaveValue("30");
    }

    await today.trendRange("Nutrient trend").selectOption("7");
    for (const panel of PANELS) {
      await expect(today.trendDays(panel)).toHaveCount(7);
    }
    await expect(today.trendRange("Calorie trend")).toHaveValue("7");
  });
});
