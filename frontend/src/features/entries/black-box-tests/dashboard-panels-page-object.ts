import type { Locator, Page } from "@playwright/test";
import { fullDayLabel, shortDayLabel } from "./today-page-object.js";

/** The date strip, the weight card and the panels of the owner's dashboard that have no steps. */
export class DashboardPanelsPageObject {
  /** The streak next to the day heading, such as "2-day logging streak". */
  readonly loggingStreak: Locator;
  readonly weightCard: Locator;
  readonly lastFourWeeksPanel: Locator;
  readonly consistencyPanel: Locator;

  constructor(private readonly page: Page) {
    this.loggingStreak = page.getByText(/-day logging streak$/);
    this.weightCard = page.getByRole("article", {
      name: "Weight",
      exact: true,
    });
    this.lastFourWeeksPanel = page.getByRole("region", {
      name: "Last 4 weeks",
      exact: true,
    });
    this.consistencyPanel = page.getByRole("region", {
      name: "Nutrient consistency",
      exact: true,
    });
  }

  /** The pill of one day in the date strip. Its name has the calories and how the day compares with the goal. */
  dayPill(date: Date): Locator {
    return this.page.getByRole("button", {
      name: new RegExp(`^${fullDayLabel(date)}`),
    });
  }

  /** The text of the maintenance estimate in the weight card. */
  get maintenanceEstimate(): Locator {
    return this.weightCard.getByText(/^Maintenance ≈ /);
  }

  /** The cell of one day and nutrient. Its name has the amount and the share of the goal. */
  consistencyCell(date: Date, nutrient: string): Locator {
    return this.consistencyPanel.getByRole("button", {
      name: new RegExp(`^${shortDayLabel(date)}, ${nutrient}: `),
    });
  }
}
