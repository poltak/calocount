import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";

const defaults = [
  ["Fiber daily goal", "28"],
  ["Total sugars daily goal", ""],
  ["Saturated fat daily goal", "20"],
  ["Monounsaturated fat daily goal", ""],
  ["Polyunsaturated fat daily goal", ""],
  ["Omega-3 daily goal", ""],
  ["Cholesterol daily goal", "300"],
  ["Vitamin A daily goal", "900"],
  ["Vitamin C daily goal", "90"],
  ["Vitamin D daily goal", "20"],
  ["Vitamin E daily goal", "15"],
  ["Vitamin K daily goal", "120"],
  ["Vitamin B6 daily goal", "1.7"],
  ["Folate daily goal", "400"],
  ["Vitamin B12 daily goal", "2.4"],
  ["Sodium daily goal", "2300"],
  ["Potassium daily goal", "4700"],
  ["Calcium daily goal", "1300"],
  ["Iron daily goal", "18"],
  ["Magnesium daily goal", "420"],
  ["Phosphorus daily goal", "1250"],
  ["Zinc daily goal", "11"],
  ["Selenium daily goal", "55"],
  ["Caffeine daily goal", "400"],
] as const;

test.describe("recommended nutrition goals", () => {
  test("should restore every nutrition goal to its recommended default", async ({
    page,
  }) => {
    await new TodayPageObject(page).goto();
    const settings = new SettingsPageObject(page);
    await settings.open();
    await settings.nutritionGoals.click();
    for (const [label] of defaults) {
      await settings.field(label).fill("9");
    }
    await settings.restoreDefaults();
    for (const [label, value] of defaults) {
      await expect(settings.field(label)).toHaveValue(value);
    }
    await settings.save();
    await page.reload();
    await settings.open();
    await settings.nutritionGoals.click();
    for (const [label, value] of defaults) {
      await expect(settings.field(label)).toHaveValue(value);
    }
  });
});
