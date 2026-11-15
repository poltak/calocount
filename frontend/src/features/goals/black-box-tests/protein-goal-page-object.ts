import type { Page } from "@playwright/test";

/** The protein card of the owner's dashboard, with the day's protein target. */
export class ProteinGoalPageObject {
  constructor(private readonly page: Page) {}

  /** The notice of a per-kilogram goal on a day with no weight. */
  get missingWeightNotice() {
    return this.page.getByText(
      "Record a weight to calculate your daily protein goal.",
      { exact: true },
    );
  }

  /** The day's target, such as "/ 140g". */
  target(grams: number) {
    return this.page.getByText(`/ ${grams}g`, { exact: true });
  }
}
