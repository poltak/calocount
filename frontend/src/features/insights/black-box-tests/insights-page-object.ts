import type { Page } from "@playwright/test";

/** The insight panels at the bottom of the owner's dashboard. */
export class InsightsPageObject {
  constructor(private readonly page: Page) {}

  panel(name: string) {
    return this.page.getByRole("region", { name, exact: true });
  }

  /** Open the nutrition section when the owner collapsed it. */
  async showNutrition() {
    const button = this.page.getByRole("button", {
      name: "Show details",
      exact: true,
    });
    if (await button.isVisible()) {
      await button.click();
    }
  }
}
