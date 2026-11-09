import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";
import { PasskeySignInPageObject } from "../../auth/black-box-tests/passkey-sign-in-page-object.js";
import { PublicPageObject } from "./public-page-object.js";

test.use({ authenticated: false, passkeyDevice: true });

test.describe("public dashboard", () => {
  test("should publish the owner's log with no write controls only while the public view is on", async ({
    page,
    visitorPage,
    setupCode,
  }) => {
    const today = new TodayPageObject(page);
    const settings = new SettingsPageObject(page);
    const visitor = new PublicPageObject(visitorPage);
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();
    await signIn.setUp(setupCode);
    await today.goto();
    await today.addEntry({
      name: "Public breakfast",
      calories: 300,
      protein: 20,
    });
    await visitor.goto();
    await expect(visitor.entry("Public breakfast")).toBeHidden();
    await settings.open();
    await settings
      .field("Show my log to anyone who opens the site address")
      .check();
    await settings.save();
    await page.reload();
    await settings.open();
    await expect(
      settings.field("Show my log to anyone who opens the site address"),
    ).toBeChecked();
    await visitor.goto();
    await expect(visitor.entry("Public breakfast")).toBeVisible();
    await expect(visitor.addEntry).toBeHidden();
    await expect(visitor.settings).toBeHidden();
    await expect(visitor.ownerLink).toBeVisible();
    await settings
      .field("Show my log to anyone who opens the site address")
      .uncheck();
    await settings.save();
    await visitor.goto();
    await expect(visitor.entry("Public breakfast")).toBeHidden();
  });
});
