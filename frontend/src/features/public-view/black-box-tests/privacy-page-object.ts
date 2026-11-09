import type { Page } from "@playwright/test";

/** The privacy policy at `/privacy`, which the ChatGPT app listing links to. */
export class PrivacyPageObject {
  constructor(private readonly page: Page) {}

  get heading() {
    return this.page.getByRole("heading", { name: "Privacy Policy", level: 1 });
  }

  section(name: string) {
    return this.page.getByRole("region", { name });
  }

  async goto() {
    await this.page.goto("/privacy");
    await this.heading.waitFor();
  }
}
