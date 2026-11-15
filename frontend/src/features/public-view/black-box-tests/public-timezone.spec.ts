import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";
import { PublicPageObject } from "./public-page-object.js";

const PUBLIC_VIEW = "Show my log to anyone who opens the site address";

// The owner's device is in Tokyo, and the visitor's is in UTC.
test.use({ timezoneId: "Asia/Tokyo" });

test.describe("the public view in another timezone", () => {
  test("should show the owner's entry times in the owner's saved timezone, and say so", async ({
    page,
    visitorPage,
  }) => {
    const today = new TodayPageObject(page);
    const settings = new SettingsPageObject(page);
    await today.goto();
    await settings.open();
    await settings.timezone.selectOption("Asia/Tokyo");
    await settings.field(PUBLIC_VIEW).check();
    await settings.save();
    await today.addEntry({ name: "Pho", calories: 450, time: "07:30" });

    const visitor = new PublicPageObject(visitorPage);
    await visitor.goto();

    await expect(visitor.entry("Pho")).toContainText("07:30");
    await expect(visitor.timezoneNotice("Asia/Tokyo")).toBeVisible();
  });
});
