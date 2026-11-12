import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { ComponentLibraryPageObject } from "./component-library-page-object.js";

test.use({ authenticated: false });

test.describe("component library", () => {
  test("should show each group of components", async ({ page }) => {
    const gallery = new ComponentLibraryPageObject(page);
    await gallery.goto();

    await expect(gallery.heading).toBeVisible();
    for (const name of [
      "Button, LinkButton, IconButton, ButtonGroup",
      "Tabs, NavTabs",
      "Form, FormRow, FormActions, FieldGroup",
      "Card, List, KeyValueList, DataTable",
      "Menu, Disclosure, Dialog, Toolbar",
      "Icons",
    ]) {
      await expect(gallery.section(name)).toBeVisible();
    }
    await expect(gallery.disabledButton).toBeDisabled();
  });

  test("should refuse the example form with no name, then accept a name", async ({
    page,
  }) => {
    const gallery = new ComponentLibraryPageObject(page);
    await gallery.goto();

    await gallery.fillName("Separate name");
    await expect(gallery.contactNameInput).toHaveValue("");
    await gallery.saveContact();

    await expect(gallery.nameError).toHaveText("Enter a name");
    await expect(gallery.saved).toBeHidden();

    await gallery.fillContactName("Ada Lovelace");
    await expect(gallery.nameInput).toHaveValue("Separate name");
    await gallery.saveContact();

    await expect(gallery.nameError).toBeHidden();
    await expect(gallery.saved).toBeVisible();
  });

  test("should open the example dialog and close it with Escape", async ({
    page,
  }) => {
    const gallery = new ComponentLibraryPageObject(page);
    await gallery.goto();

    await gallery.discardTrigger.click();
    await expect(gallery.dialog).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(gallery.dialog).toBeHidden();
  });
});
