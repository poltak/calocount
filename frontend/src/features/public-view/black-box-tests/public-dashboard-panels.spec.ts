import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";
import { PublicPageObject } from "./public-page-object.js";

const PUBLIC_VIEW = "Show my log to anyone who opens the site address";

const PANELS = [
  "Calorie trend",
  "Protein vs target",
  "Weight trend",
  "Macros trend",
  "Nutrient consistency",
  "Last 4 weeks",
  "Nutrition details",
  "Macros",
  /^Entries \d+$/,
  "Insights",
  "Food sources",
  "Nutrition attention",
  "Days worth repeating",
  "What changed this week?",
];

test.describe("the public dashboard panels", () => {
  test("should show a visitor every panel of the owner's dashboard with no control that changes data, and let the visitor change the range of a trend", async ({
    page,
    visitorPage,
  }) => {
    const today = new TodayPageObject(page);
    const settings = new SettingsPageObject(page);
    await today.goto();
    await today.addEntry({ name: "Shared oats", calories: 300, protein: 12 });
    await today.saveWeight(70, { editing: false });
    await settings.open();
    await settings.field(PUBLIC_VIEW).check();
    await settings.save();

    const visitor = new PublicPageObject(visitorPage);
    await visitor.goto();

    await expect(visitor.readOnlyNotice).toBeVisible();
    for (const title of PANELS) {
      await expect(visitor.panel(title)).toBeVisible();
    }
    await expect(visitor.entry("Shared oats")).toBeVisible();
    await expect(visitor.panel("Weight trend")).toContainText("70");

    await expect(visitor.editEntry("Shared oats")).toBeHidden();
    await expect(visitor.deleteEntry("Shared oats")).toBeHidden();
    await expect(visitor.addEntry).toBeHidden();
    await expect(visitor.weightButton).toBeHidden();
    await expect(visitor.savedEntriesHeading).toBeHidden();
    await expect(visitor.settings).toBeHidden();

    const range = visitor.trendRange("Calorie trend");
    await expect(range).toHaveValue("7");
    await range.selectOption("30");
    await expect(range).toHaveValue("30");
  });
});
