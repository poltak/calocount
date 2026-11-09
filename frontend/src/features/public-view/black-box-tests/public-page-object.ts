import type { Page } from "@playwright/test";

export class PublicPageObject {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/");
  }

  entry(name: string) {
    return this.page.getByRole("article", { name, exact: true });
  }

  get addEntry() {
    return this.page.getByRole("button", { name: "Add entry", exact: true });
  }

  get settings() {
    return this.page.getByRole("button", { name: "Open settings" });
  }

  get ownerLink() {
    return this.page.getByRole("link", { name: "Open owner view" });
  }
}
