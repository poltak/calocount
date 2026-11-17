import type { Locator, Page } from "@playwright/test";
import { shortDayLabel } from "../../entries/black-box-tests/today-page-object.js";

const insightDayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** A day as the insight panels name it, such as "Nov 9, 2026". */
export function insightDayLabel(date: Date): string {
  return insightDayFormat.format(date);
}

/** The insight panels at the bottom of the owner's dashboard. */
export class InsightsPageObject {
  constructor(private readonly page: Page) {}

  panel(name: string) {
    return this.page.getByRole("region", { name, exact: true });
  }

  /** A list or select in an insight panel, such as "Measure". */
  choice(scope: Locator, label: string) {
    return scope.getByRole("combobox", { name: label, exact: true });
  }

  /** A button of an insight panel, such as "7 days". */
  button(scope: Locator, name: string) {
    return scope.getByRole("button", { name, exact: true });
  }

  // Nutrition attention

  /** The button of one day in the list of high days, such as "Nov 9". */
  excessDay(date: Date) {
    return this.panel("Nutrition attention").getByRole("button", {
      name: new RegExp(`^${shortDayLabel(date)}: `),
    });
  }

  // Inspect entry

  /** Open the "Fiber" row of "Data coverage", which lists the entries with a missing value. */
  async openFiberCoverageRow(): Promise<Locator> {
    const row = this.panel("Data coverage")
      .getByRole("group")
      .filter({ hasText: "Fiber" })
      .first();
    await row.getByText("Fiber", { exact: true }).click();
    return row;
  }

  /** The "Inspect entry" buttons on the page. */
  get inspectEntryButtons() {
    return this.page.getByRole("button", {
      name: "Inspect entry",
      exact: true,
    });
  }

  // Weekly changes

  /** The card of one measure, such as "Protein", in "What changed this week?". */
  weeklyMeasure(name: string) {
    return this.panel("What changed this week?").getByRole("article", {
      name: new RegExp(`^${name}`),
    });
  }

  // Food sources

  /** The row of a food in "Food sources", such as "Eggs". Its button opens the entries. */
  foodSource(name: string) {
    return this.panel("Food sources").getByRole("button", {
      name: new RegExp(`^${name}`),
    });
  }

  /** The foods of "Food sources", the largest first. */
  foodSourceRows() {
    return this.panel("Food sources")
      .getByRole("list", { name: /^Foods that supply the most / })
      .getByRole("button");
  }

  /** The entries of a food that the owner opened, such as "Eggs". */
  foodSourceEntries(name: string) {
    return this.panel("Food sources")
      .getByRole("list", { name: `${name} entries`, exact: true })
      .getByRole("listitem");
  }

  /** Show the entries of a food, or hide them again. */
  async toggleFoodSource(name: string) {
    await this.foodSource(name).click();
  }
}
