import type { Locator, Page } from "@playwright/test";
import { shortDayLabel } from "./today-page-object.js";

const weekdayShortFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: "UTC",
});

/** The recent days and the nutrient consistency matrix of the owner's dashboard. */
export class DashboardPanelsPageObject {
  readonly recentDaysPanel: Locator;
  readonly recentDaysToggle: Locator;
  /** The line under the recent days, such as "2 days logging streak". */
  readonly loggingStreak: Locator;
  readonly consistencyPanel: Locator;

  constructor(page: Page) {
    this.recentDaysPanel = page.getByRole("region", {
      name: "Recent days",
      exact: true,
    });
    this.recentDaysToggle = this.recentDaysPanel.getByRole("button", {
      name: /^(View all|Less)$/,
    });
    this.loggingStreak = this.recentDaysPanel.getByText(/logging streak$/);
    this.consistencyPanel = page.getByRole("region", {
      name: "Nutrient consistency",
      exact: true,
    });
  }

  /** The row of one day in the recent days. It shows the day, the weekday and the calories. */
  recentDayRow(date: Date): Locator {
    const day = String(date.getUTCDate());
    const weekday = weekdayShortFormat.format(date);
    return this.recentDaysPanel.getByRole("button", {
      name: new RegExp(`^${day}\\s*${weekday}\\s*[\\d,]+\\s*kcal`),
    });
  }

  /** The cell of one day and nutrient. Its name has the amount and the share of the goal. */
  consistencyCell(date: Date, nutrient: string): Locator {
    return this.consistencyPanel.getByRole("button", {
      name: new RegExp(`^${shortDayLabel(date)}, ${nutrient}: `),
    });
  }
}
