import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { PasskeySignInPageObject } from "./passkey-sign-in-page-object.js";

test.use({ authenticated: false, passkeyDevice: true });

test.describe("passkey sign-in", () => {
  test("should save the first passkey with the setup code and open the dashboard", async ({
    page,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();

    await signIn.setUp(setupCode);

    await expect(new TodayPageObject(page).addEntryButton).toBeVisible();
  });

  test("should sign the owner in with the saved passkey after a sign-out", async ({
    page,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();
    await signIn.setUp(setupCode);
    await new TodayPageObject(page).addEntryButton.waitFor();

    await page.context().clearCookies();
    await signIn.goto();
    await signIn.signIn();

    await expect(new TodayPageObject(page).addEntryButton).toBeVisible();
  });
});

test.describe("sign-in edge cases", () => {
  test("should refuse a wrong setup code", async ({ page }) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();
    await signIn.submitSetupCode("wrong-setup-code");
    await expect(signIn.setupError).toBeVisible();
    await expect(signIn.setUpHeading).toBeVisible();
    await expect(new TodayPageObject(page).addEntryButton).toBeHidden();
  });
});
