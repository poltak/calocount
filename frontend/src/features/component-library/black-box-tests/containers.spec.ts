import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { ComponentLibraryPageObject } from "./component-library-page-object.js";

test.use({ authenticated: false });

test("should keep the list, definitions, and table names and values", async ({
  page,
}) => {
  const gallery = new ComponentLibraryPageObject(page);
  await gallery.goto();

  await expect(gallery.invoiceItems).toHaveCount(2);
  await expect(gallery.invoiceItems.first()).toContainText("Invoice 1042");
  await expect(gallery.invoiceItems.first()).toContainText(
    "Sent to Ada Lovelace",
  );
  await expect(gallery.invoiceItems.last()).toContainText("Overdue");
  await expect(gallery.invoiceDetails).toHaveText(["Ada Lovelace", "Team"]);
  await expect(gallery.invoiceTable).toBeVisible();
  await expect(gallery.invoiceAmount("Invoice 1043 $89.50")).toBeVisible();
});

test("should toggle the history with Enter and Space", async ({ page }) => {
  const gallery = new ComponentLibraryPageObject(page);
  await gallery.goto();

  await expect(gallery.historyTrigger).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(gallery.history).toBeHidden();
  await gallery.historyTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(gallery.historyTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(gallery.history).toBeVisible();
  await page.keyboard.press("Space");
  await expect(gallery.historyTrigger).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(gallery.history).toBeHidden();
});

test("should trap dialog focus and return it after each close action", async ({
  page,
}) => {
  const gallery = new ComponentLibraryPageObject(page);
  await gallery.goto();

  await gallery.discardTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(gallery.dialog).toHaveAccessibleDescription(
    "The changes you made are lost.",
  );
  await expect(gallery.dialogButton("Close")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(gallery.dialogButton("Keep editing")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(gallery.dialogButton("Close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(gallery.dialog).toBeHidden();
  await expect(gallery.discardTrigger).toBeFocused();

  for (const name of ["Close", "Keep editing", "Discard"]) {
    await gallery.discardTrigger.click();
    await gallery.dialogButton(name).click();
    await expect(gallery.dialog).toBeHidden();
    await expect(gallery.discardTrigger).toBeFocused();
  }

  await gallery.discardTrigger.click();
  await expect(gallery.dialog).toBeVisible();
  await gallery.clickOutsideDialog();
  await expect(gallery.dialog).toBeHidden();
  await expect(gallery.discardTrigger).toBeFocused();
});

test("should show help on focus and hover and dismiss it with Escape", async ({
  page,
}) => {
  const gallery = new ComponentLibraryPageObject(page);
  await gallery.goto();

  await gallery.helpTrigger.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(gallery.help).toHaveText(
    "A short help text, on hover and on focus.",
  );
  await expect(gallery.helpTrigger).toHaveAccessibleName(
    "A short help text, on hover and on focus.",
  );
  await page.keyboard.press("Escape");
  await expect(gallery.help).toBeHidden();
  await expect(gallery.helpTrigger).toBeFocused();
  await gallery.heading.click();
  await gallery.helpTrigger.hover();
  await expect(gallery.help).toBeVisible();
});

test("should open the popover with the keyboard and return focus on Escape", async ({
  page,
}) => {
  const gallery = new ComponentLibraryPageObject(page);
  await gallery.goto();

  await gallery.popoverTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(gallery.popover).toBeVisible();
  await expect(gallery.popover).toHaveAccessibleDescription(
    // oxlint-disable-next-line testing/no-fixed-date-in-expect -- The gallery shows this fixed sample text, not a date that depends on today.
    "Sent to Ada Lovelace on 3 November.",
  );
  await page.keyboard.press("Escape");
  await expect(gallery.popover).toBeHidden();
  await expect(gallery.popoverTrigger).toBeFocused();
});
