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

  /** The banner that says the page changes nothing. */
  get readOnlyNotice() {
    return this.page.getByText(
      /Public read-only view — changes are disabled\./,
    );
  }

  /** A panel of the dashboard by its heading. Give a pattern for a heading with a count, such as "Entries 1". */
  panel(title: string | RegExp) {
    return this.page.getByRole("region", {
      name: title,
      ...(typeof title === "string" ? { exact: true } : {}),
    });
  }

  /** The select that sets the range of a trend panel, such as "Calorie trend". */
  trendRange(title: string) {
    return this.panel(title).getByLabel(`${title} range`);
  }

  /** The heading of the saved entries, which only the owner has. */
  get savedEntriesHeading() {
    return this.page.getByRole("heading", { name: /^Saved entries/ });
  }

  editEntry(name: string) {
    return this.page.getByRole("button", { name: `Edit ${name}`, exact: true });
  }

  deleteEntry(name: string) {
    return this.page.getByRole("button", {
      name: `Delete ${name}`,
      exact: true,
    });
  }

  /** The button that adds or changes a weight. */
  get weightButton() {
    return this.page.getByRole("button", { name: /^(Add|Edit) weight$/ });
  }

  /** The line that says in which timezone the page shows days and times. */
  timezoneNotice(timezone: string) {
    return this.page.getByText(`Days and times are shown in ${timezone} time.`);
  }
}
