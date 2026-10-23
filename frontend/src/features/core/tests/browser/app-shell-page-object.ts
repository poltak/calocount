import type { Locator, Page } from "@playwright/test";

/** The start path, and the header that every page behind the session gate has. */
export class AppShellPageObject {
  constructor(private readonly page: Page) {}

  /**
   * The start path shows the start page to a signed-in user, and sends a
   * visitor to the sign-in page. The test checks which page shows.
   */
  async goto(): Promise<void> {
    await this.page.goto("/");
  }

  userName(name: string): Locator {
    return this.page.getByRole("banner").getByText(name, { exact: true });
  }

  async signOut(): Promise<void> {
    await this.page
      .getByRole("banner")
      .getByRole("button", { name: "Sign out" })
      .click();
  }
}
