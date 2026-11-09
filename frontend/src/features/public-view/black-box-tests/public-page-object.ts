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

  /** The line that says in which timezone the page shows days and times. */
  timezoneNotice(timezone: string) {
    return this.page.getByText(`Days and times are shown in ${timezone} time.`);
  }
}
