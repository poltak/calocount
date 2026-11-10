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

  /** One of the cards inside a panel, such as "Compare a food change". */
  card(name: string) {
    return this.page.getByRole("article", { name, exact: true });
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

  /** A list or select in an insight panel, such as "Food to add". */
  choice(scope: Locator, label: string) {
    return scope.getByRole("combobox", { name: label, exact: true });
  }

  /** A button of an insight panel, such as "7 days" or "1.5×". */
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

  // Nutrition food insights

  /** The "Exclude" button of the nth food in "Where a nutrient comes from". */
  excludeButton(position: number) {
    return this.card("Where a nutrient comes from")
      .getByRole("button", { name: "Exclude", exact: true })
      .nth(position);
  }

  // Weekly changes

  /** The button of one measure, such as "Protein", in "What changed this week?". */
  weeklyMeasure(name: string) {
    return this.panel("What changed this week?").getByRole("button", {
      name: new RegExp(`^${name}( |$)`),
    });
  }

  // Frequency and amount

  /** The button of a food in the list under the chart. */
  frequencyFood(name: string) {
    return this.panel("Frequency & amount").getByRole("button", {
      name: new RegExp(`^${name} [\\d.]+×/week`),
    });
  }

  /** The dot of a food in the chart. */
  frequencyPoint(name: string) {
    return this.panel("Frequency & amount").getByRole("button", {
      name: new RegExp(`^${name}: `),
    });
  }
}
