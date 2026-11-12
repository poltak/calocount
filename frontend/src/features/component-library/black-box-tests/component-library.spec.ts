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
      "Button, ButtonGroup",
      "Tabs",
      "Input, Textarea, InputGroup, Select, Checkbox, RadioGroup",
      "Field, FieldGroup, FieldSet",
      "Card, List, KeyValueList, DataTable",
      "DropdownMenu, Disclosure, Dialog, Toolbar",
      "Icons",
    ]) {
      await expect(gallery.section(name)).toBeVisible();
    }
    await expect(gallery.disabledButton).toBeDisabled();
  });

  test("should keep button names, busy state, groups, and links", async ({
    page,
  }) => {
    const gallery = new ComponentLibraryPageObject(page);
    await gallery.goto();

    await expect(gallery.busyButton).toBeDisabled();
    await expect(gallery.busyButton).toHaveAttribute("aria-busy", "true");
    await expect(gallery.editButton).toBeVisible();
    await expect(gallery.removeButton).toHaveAttribute(
      "aria-keyshortcuts",
      "Del",
    );
    await expect(gallery.zoomGroup).toBeVisible();
    await expect(gallery.pageLink).toHaveAttribute("href", "/components");
    await expect(gallery.siteLink).toHaveAttribute("target", "_blank");
    await gallery.pageLink.click();
    await expect(gallery.heading).toBeVisible();
  });

  test("should change both tab examples with the keyboard", async ({
    page,
  }) => {
    const gallery = new ComponentLibraryPageObject(page);
    await gallery.goto();

    await expect(gallery.filterTab("Open")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await gallery.filterTab("Open").focus();
    await page.keyboard.press("ArrowRight");
    await expect(gallery.filterTab("Closed")).toBeFocused();
    await expect(gallery.filterTab("Closed")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(gallery.partsTab("Closed")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("ArrowRight");
    await expect(gallery.filterTab("Open")).toBeFocused();
    await expect(gallery.partsTab("Open")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await gallery.navigationLink.click();
    await expect(gallery.heading).toBeVisible();
  });

  test("should choose a menu action and close the menu with Escape", async ({
    page,
  }) => {
    const gallery = new ComponentLibraryPageObject(page);
    await gallery.goto();

    await gallery.actionsTrigger.click();
    await expect(gallery.actionsMenu).toBeVisible();
    await gallery.chooseMenuAction("Duplicate");
    await expect(gallery.lastMenuAction("Duplicate")).toBeVisible();
    await expect(gallery.actionsMenu).toBeHidden();
    await gallery.actionsTrigger.focus();
    await page.keyboard.press("ArrowDown");
    await expect(gallery.actionsMenu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(gallery.actionsMenu).toBeHidden();
    await expect(gallery.actionsTrigger).toBeFocused();
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
    await expect(gallery.contactNameInput).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(gallery.contactNameInput).toHaveAccessibleDescription(
      "Enter a name",
    );
    await expect(gallery.saved).toBeHidden();

    await gallery.fillContactName("Ada Lovelace");
    await expect(gallery.nameInput).toHaveValue("Separate name");
    await gallery.saveContact();

    await expect(gallery.nameError).toBeHidden();
    await expect(gallery.saved).toBeVisible();
    await expect(gallery.contactNameInput).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  });

  test("should keep field names, descriptions, and search results", async ({
    page,
  }) => {
    const gallery = new ComponentLibraryPageObject(page);
    await gallery.goto();

    await expect(gallery.nameInput).toHaveAccessibleDescription(
      "The name that others see.",
    );
    await expect(gallery.emailInput).toHaveAttribute("aria-invalid", "true");
    await expect(gallery.emailInput).toHaveAccessibleDescription(
      "Enter an email address",
    );
    await gallery.searchInput.fill("overdue");
    await expect(gallery.searchMatch).toHaveText("overdue");
    await expect(gallery.searchInput).toHaveValue("overdue");
  });

  test("should change select, checkbox, and radio choices with the keyboard", async ({
    page,
  }) => {
    const gallery = new ComponentLibraryPageObject(page);
    await gallery.goto();

    await expect(gallery.planSelect).toContainText("Free");
    await gallery.planSelect.focus();
    await page.keyboard.press("ArrowDown");
    await expect(gallery.planOption("Team")).toBeVisible();
    await gallery.planOption("Team").click();
    await expect(gallery.planSelect).toContainText("Team");
    await gallery.planSelect.focus();
    await page.keyboard.press("ArrowDown");
    await expect(gallery.planOption("Business")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(gallery.planSelect).toBeFocused();
    await expect(gallery.planSelect).toContainText("Team");

    await expect(gallery.archiveCheckbox).toBeChecked();
    await expect(gallery.archiveCheckbox).toHaveAccessibleDescription(
      "Archived items stay in the list.",
    );
    await gallery.archiveCheckbox.focus();
    await page.keyboard.press("Space");
    await expect(gallery.archiveCheckbox).not.toBeChecked();
    await gallery.archiveCheckbox.click();
    await expect(gallery.archiveCheckbox).toBeChecked();

    await expect(gallery.channelOption("Email")).toBeChecked();
    await gallery.channelOption("Email").focus();
    await page.keyboard.press("ArrowDown");
    await expect(gallery.channelOption("Text message")).toBeChecked();
    await page.keyboard.press("ArrowDown");
    await expect(gallery.channelOption("Push")).toBeChecked();
    await expect(gallery.channelOption("Push")).toHaveAccessibleDescription(
      "Needs the app.",
    );
  });

  test("should clear the example form on Cancel without changing other fields", async ({
    page,
  }) => {
    const gallery = new ComponentLibraryPageObject(page);
    await gallery.goto();

    await gallery.fillName("Separate name");
    await gallery.fillContactName("Ada Lovelace");
    await gallery.noteInput.fill("A note for the team.");
    await gallery.saveContact();
    await expect(gallery.saved).toBeVisible();
    await gallery.cancelContact();

    await expect(gallery.contactNameInput).toHaveValue("");
    await expect(gallery.noteInput).toHaveValue("");
    await expect(gallery.saved).toBeHidden();
    await expect(gallery.nameError).toBeHidden();
    await expect(gallery.nameInput).toHaveValue("Separate name");
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
