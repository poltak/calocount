import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";
import { PrivacyPageObject } from "../../public-view/black-box-tests/privacy-page-object.js";
import { SettingsPageObject } from "./settings-page-object.js";

// A user sees the theme as colours, so these tests compare pictures of a
// heading: one picture for each theme, then the heading in the page under test.
test.describe("theme appearance", () => {
  test("should follow a live change of the system theme only while the choice is System", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const settings = new SettingsPageObject(page);
    const shot = () => today.dayHeading.screenshot({ animations: "disabled" });
    await page.emulateMedia({ colorScheme: "light" });
    await today.goto();
    await settings.chooseTheme("Light");
    const light = await shot();
    await settings.chooseTheme("Dark");
    const dark = await shot();
    expect(dark).not.toEqual(light);

    await settings.chooseTheme("System");
    await expect(async () => expect(await shot()).toEqual(light)).toPass();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(async () => expect(await shot()).toEqual(dark)).toPass();
    await page.emulateMedia({ colorScheme: "light" });
    await expect(async () => expect(await shot()).toEqual(light)).toPass();

    await settings.chooseTheme("Dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(async () => expect(await shot()).toEqual(dark)).toPass();
    await settings.chooseTheme("Light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(async () => expect(await shot()).toEqual(light)).toPass();
  });

  test("should paint the saved theme on the first load, and the system theme when nothing is saved", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const settings = new SettingsPageObject(page);
    const privacy = new PrivacyPageObject(page);
    const shot = () => privacy.heading.screenshot({ animations: "disabled" });
    await page.emulateMedia({ colorScheme: "light" });
    await privacy.goto();
    const light = await shot();
    await page.emulateMedia({ colorScheme: "dark" });
    await privacy.goto();
    const dark = await shot();
    expect(dark).not.toEqual(light);
    await page.emulateMedia({ colorScheme: "light" });
    await today.goto();
    await settings.chooseTheme("Dark");

    await privacy.goto();

    expect(await shot()).toEqual(dark);
    await page.emulateMedia({ colorScheme: "dark" });
    await today.goto();
    await settings.chooseTheme("Light");
    await privacy.goto();
    expect(await shot()).toEqual(light);
  });
});
