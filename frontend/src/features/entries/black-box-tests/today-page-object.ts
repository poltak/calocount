import type { Locator, Page } from "@playwright/test";

/** The values of a new entry. Each number is optional, except the calories. */
export interface NewEntry {
  name: string;
  calories: number;
  description?: string;
  /** The time of day, as `HH:MM`. */
  time?: string;
  protein?: number;
  carbs?: number;
  fat?: number;
}

/** The owner's dashboard: the selected day, its entries, and the form for a new entry. */
export class TodayPageObject {
  readonly addEntryButton: Locator;
  readonly addEntryForm: Locator;

  constructor(private readonly page: Page) {
    this.addEntryButton = page.getByRole("button", {
      name: "Add entry",
      exact: true,
    });
    this.addEntryForm = page.getByRole("form", { name: "Log an entry" });
  }

  get missingProteinWeight() {
    return this.page.getByText(
      "Record a weight to calculate your daily protein goal.",
      { exact: true },
    );
  }

  proteinTarget(value: number) {
    return this.page.getByText(`/ ${value}g`, { exact: true });
  }

  async recordWeight(weight: number) {
    await this.page
      .getByRole("button", { name: "Add weight", exact: true })
      .click();
    await this.page
      .getByLabel("Weight (kg)", { exact: true })
      .fill(String(weight));
    await this.page
      .getByRole("button", { name: "Save weight", exact: true })
      .click();
  }

  async openDay(date: Date) {
    await this.page
      .getByRole("button", { name: "Open calendar", exact: true })
      .click();
    const calendar = this.page.getByRole("region", {
      name: "Calendar of past days",
    });
    const day = date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    if (date.getUTCMonth() !== new Date().getUTCMonth()) {
      await calendar.getByRole("button", { name: "Previous month" }).click();
    }
    await calendar
      .getByRole("button", { name: new RegExp(`^${day}:`) })
      .click();
    await calendar.waitFor({ state: "hidden" });
  }

  insight(name: string) {
    return this.page.getByRole("region", { name, exact: true });
  }

  async showNutrition() {
    const button = this.page.getByRole("button", {
      name: "Show details",
      exact: true,
    });
    if (await button.isVisible()) {
      await button.click();
    }
  }

  async openPartner(): Promise<void> {
    await this.page
      .getByRole("navigation", { name: "Profile" })
      .getByRole("link", { name: "Partner", exact: true })
      .click();
    await this.addEntryButton.waitFor();
  }

  async goto(): Promise<void> {
    await this.page.goto("/owner");
    await this.addEntryButton.waitFor();
  }

  /** The entry with this name, in the list of the selected day. */
  entry(name: string): Locator {
    return this.page.getByRole("article", { name, exact: true });
  }

  /** The energy and macro values of an entry, as one text such as "Energy95 kcal". */
  entryMacros(name: string): Locator {
    return this.entry(name).getByLabel("Entry macros");
  }

  async addEntry(entry: NewEntry): Promise<void> {
    await this.addEntryButton.click();
    const form = this.addEntryForm;
    if (entry.time !== undefined) {
      await form.getByLabel("Entry time").fill(entry.time);
    }
    await form
      .getByRole("textbox", { name: "Entry name", exact: true })
      .fill(entry.name);
    if (entry.description !== undefined) {
      await form
        .getByRole("textbox", { name: "Description", exact: true })
        .fill(entry.description);
    }
    const numbers: Array<[string, number | undefined]> = [
      ["Calories", entry.calories],
      ["Protein (g)", entry.protein],
      ["Carbs (g)", entry.carbs],
      ["Fat (g)", entry.fat],
    ];
    for (const [label, value] of numbers) {
      if (value !== undefined) {
        await form
          .getByRole("spinbutton", { name: label, exact: true })
          .fill(String(value));
      }
    }
    await form.getByRole("button", { name: "Save entry", exact: true }).click();
    await this.entry(entry.name).waitFor();
  }
}
