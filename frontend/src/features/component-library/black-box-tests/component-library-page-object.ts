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

  get disabledButton(): Locator {
    return this.page.getByRole("button", { name: "Disabled", exact: true });
  }

  get formSection(): Locator {
    return this.section("Form, FormRow, FormActions, FieldGroup");
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
    return this.section("Menu, Disclosure, Dialog, Toolbar").getByRole(
      "button",
      { name: "Discard changes", exact: true },
    );
  }

  get dialog(): Locator {
    return this.page.getByRole("dialog", { name: "Discard the changes?" });
  }
}
