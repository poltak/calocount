import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { PasskeySignInPageObject } from "../../auth/black-box-tests/passkey-sign-in-page-object.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "./settings-page-object.js";

test.use({ authenticated: false, passkeyDevice: true });
test.describe("account passkeys", () => {
  test("should list the saved passkey and prevent removal of the last key", async ({
    page,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();
    await signIn.setUp(setupCode);
    await new TodayPageObject(page).addEntryButton.waitFor();
    const settings = new SettingsPageObject(page);
    await settings.open();
    await expect(settings.passkeyHeading).toBeVisible();
    await expect(settings.removePasskey).toHaveCount(1);
    await expect(settings.removePasskey).toBeDisabled();
    await page.reload();
    await settings.open();
    await expect(settings.removePasskey).toHaveCount(1);
  });
});
