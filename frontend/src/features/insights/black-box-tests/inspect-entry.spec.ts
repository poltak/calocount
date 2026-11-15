import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { PublicPageObject } from "../../public-view/black-box-tests/public-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";
import { InsightsPageObject } from "./insights-page-object.js";

const PUBLIC_VIEW = "Show my log to anyone who opens the site address";

test.describe("inspect an entry from the nutrition attention panel", () => {
  test("should open the day of an entry with a missing value, and its editor", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const insights = new InsightsPageObject(page);
    await today.goto();
    await today.logHistory([
      { daysAgo: 3, entry: { name: "Plain toast", calories: 200 } },
    ]);
    await insights.showNutrition();
    await expect(today.dayHeadingOf(new Date())).toBeVisible();
    await insights.openFiberCoverageRow();

    await insights.inspectEntryButtons.first().click();

    const day = new Date(Date.now() - 3 * 86_400_000);
    await expect(today.dayHeadingOf(day)).toBeVisible();
    await expect(
      today.entryEditorField("Plain toast", "Calories"),
    ).toBeVisible();
  });

  test("should show a visitor no button to inspect an entry", async ({
    page,
    visitorPage,
  }) => {
    const today = new TodayPageObject(page);
    const settings = new SettingsPageObject(page);
    await today.goto();
    await today.logHistory([
      { daysAgo: 3, entry: { name: "Plain toast", calories: 200 } },
    ]);
    await settings.open();
    await settings.field(PUBLIC_VIEW).check();
    await settings.save();
    const visitor = new PublicPageObject(visitorPage);
    await visitor.goto();
    const insights = new InsightsPageObject(visitorPage);
    await insights.showNutrition();

    const row = await insights.openFiberCoverageRow();

    await expect(row).toContainText("Plain toast");
    await expect(insights.inspectEntryButtons).toHaveCount(0);
  });
});
