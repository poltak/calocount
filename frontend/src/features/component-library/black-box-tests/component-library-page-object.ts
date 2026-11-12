import type { Locator, Page } from "@playwright/test";

export class ComponentLibraryPageObject {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/components");
  }

  get heading(): Locator {
    return this.page.getByRole("heading", {
      name: "Component library",
      exact: true,
      level: 1,
    });
  }

  section(name: string): Locator {
    return this.page.getByRole("region", { name, exact: true });
  }

  get nameInput(): Locator {
    return this.page.getByRole("textbox", { name: "Name", exact: true });
  }

  get contactNameInput(): Locator {
    return this.formSection.getByLabel("Contact name", { exact: true });
  }

  get planSelect(): Locator {
    return this.page.getByRole("combobox", { name: "Plan", exact: true });
  }

  planOption(name: string): Locator {
    return this.page.getByRole("option", { name, exact: true });
  }

  get archiveCheckbox(): Locator {
    return this.page.getByRole("checkbox", {
      name: "Include archived items",
      exact: true,
    });
  }

  channelOption(name: string): Locator {
    return this.page
      .getByRole("radiogroup", { name: "Channel", exact: true })
      .getByRole("radio", { name, exact: true });
  }

  get searchInput(): Locator {
    return this.page.getByRole("searchbox", {
      name: "Search the example text",
      exact: true,
    });
  }

  get searchMatch(): Locator {
    return this.page.getByText("overdue", { exact: true });
  }

  get emailInput(): Locator {
    return this.page.getByRole("textbox", { name: "Email", exact: true });
  }

  get noteInput(): Locator {
    return this.formSection.getByRole("textbox", { name: "Note", exact: true });
  }

  async cancelContact(): Promise<void> {
    await this.formSection
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
  }

  async fillName(name: string): Promise<void> {
    await this.nameInput.fill(name);
  }

  get disabledButton(): Locator {
    return this.page.getByRole("button", { name: "Disabled", exact: true });
  }

  get busyButton(): Locator {
    return this.page.getByRole("button", { name: "Saving…", exact: true });
  }

  get pageLink(): Locator {
    return this.page.getByRole("link", { name: "Link to a page", exact: true });
  }

  get siteLink(): Locator {
    return this.page.getByRole("link", { name: "Link to a site", exact: true });
  }

  get zoomGroup(): Locator {
    return this.page.getByRole("group", { name: "Zoom", exact: true });
  }

  get editButton(): Locator {
    return this.page.getByRole("button", { name: "Edit", exact: true });
  }

  get removeButton(): Locator {
    return this.section("Button, ButtonGroup").getByRole("button", {
      name: "Remove",
      exact: true,
    });
  }

  filterTab(name: "Open" | "Closed"): Locator {
    return this.page
      .getByRole("tablist", { name: "Example filter", exact: true })
      .getByRole("tab", {
        name: `${name} ${name === "Open" ? 3 : 1}`,
        exact: true,
      });
  }

  partsTab(name: "Open" | "Closed"): Locator {
    return this.page
      .getByRole("tablist", { name: "Example parts", exact: true })
      .getByRole("tab", { name, exact: true });
  }

  get navigationLink(): Locator {
    return this.page
      .getByRole("navigation", { name: "Example links", exact: true })
      .getByRole("link", { name: "Components", exact: true });
  }

  get actionsTrigger(): Locator {
    return this.page.getByRole("button", { name: "Actions", exact: true });
  }

  get actionsMenu(): Locator {
    return this.page.getByRole("menu", { name: "Actions", exact: true });
  }

  async chooseMenuAction(name: string): Promise<void> {
    await this.actionsMenu.getByRole("menuitem", { name, exact: true }).click();
  }

  lastMenuAction(name: string): Locator {
    return this.page.getByText(`Last menu action: ${name}`, { exact: true });
  }

  get formSection(): Locator {
    return this.section("Field, FieldGroup, FieldSet");
  }

  async saveContact(): Promise<void> {
    await this.formSection
      .getByRole("button", { name: "Save contact", exact: true })
      .click();
  }

  get nameError(): Locator {
    return this.formSection.getByRole("alert");
  }

  async fillContactName(name: string): Promise<void> {
    await this.formSection.getByLabel("Contact name").fill(name);
  }

  get saved(): Locator {
    return this.formSection.getByText("Saved.", { exact: true });
  }

  get discardTrigger(): Locator {
    return this.section("DropdownMenu, Disclosure, Dialog, Toolbar").getByRole(
      "button",
      { name: "Discard changes", exact: true },
    );
  }

  get dialog(): Locator {
    return this.page.getByRole("dialog", { name: "Discard the changes?" });
  }
}
