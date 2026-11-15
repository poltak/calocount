import type { Page } from "@playwright/test";

/** The switch between the owner's log and the partner's log. */
export class ProfileSwitchPageObject {
  constructor(private readonly page: Page) {}

  async openPartner(): Promise<void> {
    await this.page
      .getByRole("navigation", { name: "Profile" })
      .getByRole("link", { name: "Partner", exact: true })
      .click();
    await this.page.waitForURL("**/owner/partner");
    await this.page
      .getByRole("button", { name: "Add entry", exact: true })
      .waitFor();
  }
}
