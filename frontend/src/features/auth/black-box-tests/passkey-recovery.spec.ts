import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { SettingsPageObject } from "../../settings/black-box-tests/settings-page-object.js";
import { PasskeySignInPageObject } from "./passkey-sign-in-page-object.js";

test.use({ authenticated: false, passkeyDevice: true });

test.describe("a lost passkey", () => {
  test("should let the owner add a passkey on another device with the setup code", async ({
    page,
    otherDevicePage,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();
    await signIn.setUp(setupCode);
    const otherDevice = new PasskeySignInPageObject(otherDevicePage);
    await otherDevice.goto();

    await otherDevice.recover(setupCode);

    await expect(
      new TodayPageObject(otherDevicePage).addEntryButton,
    ).toBeVisible();
  });

  test("should let the owner remove the passkey of another device, but not the last one", async ({
    page,
    otherDevicePage,
    setupCode,
  }) => {
    const signIn = new PasskeySignInPageObject(page);
    await signIn.goto();
    await signIn.setUp(setupCode);
    const otherDevice = new PasskeySignInPageObject(otherDevicePage);
    await otherDevice.goto();
    await otherDevice.recover(setupCode);
    const settings = new SettingsPageObject(page);
    await settings.open();
    await expect(settings.removePasskeyButtons).toHaveCount(2);

    await settings.removeOtherDevicePasskey();

    await expect(settings.removePasskeyButtons).toHaveCount(1);
    await expect(settings.removePasskeyButtons).toBeDisabled();
  });
});
