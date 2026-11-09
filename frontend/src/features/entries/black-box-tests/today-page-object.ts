import type { Locator, Page } from "@playwright/test";

/** A file for the photo field. */
export interface PhotoFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** The values of a new entry. Each number is optional, except the calories. */
export interface NewEntry {
  name: string;
  calories: number;
  description?: string;
  /** The time of day, as `HH:MM`. */
  time?: string;
  /** The label of an entry type, such as `Dinner`. */
  type?: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  /** Optional nutrients by their label in "Advanced nutrition", such as `Fiber`. */
  nutrients?: Record<string, number>;
  photo?: PhotoFile;
}

/** The values that the editor of an entry can change. */
export interface EntryChanges {
  name?: string;
  description?: string;
  type?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export type DashboardSection =
  "Today" | "Entries" | "Trend" | "Macros" | "Nutrition";

const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const shortDayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** The day that is `count` days before today, in UTC. */
export function daysAgo(count: number): Date {
  return new Date(Date.now() - count * 86_400_000);
}

/** A day as the dashboard names it, such as "Thursday, August 20, 2026". */
export function fullDayLabel(date: Date): string {
  return dayFormat.format(date);
}

/** A day as the trend charts name it, such as "Aug 20". */
export function shortDayLabel(date: Date): string {
  return shortDayFormat.format(date);
}

/** The owner's dashboard: the selected day, its entries, trends, weight and saved entries. */
export class TodayPageObject {
  readonly addEntryButton: Locator;
  readonly addEntryForm: Locator;
  readonly dayHeading: Locator;
  readonly previousDayButton: Locator;
  readonly nextDayButton: Locator;
  readonly calendarToggle: Locator;
  readonly calendar: Locator;
  readonly summary: Locator;
  readonly entriesPanel: Locator;
  readonly savedEntriesPanel: Locator;
  readonly weightPanel: Locator;
  readonly addWeightButton: Locator;
  readonly editWeightButton: Locator;
  readonly weightField: Locator;
  readonly sectionTabs: Locator;
  readonly nutritionHideButton: Locator;
  readonly nutritionShowButton: Locator;
  readonly nutritionOverview: Locator;
  readonly photoPreview: Locator;
  readonly photoPreviewCloseButton: Locator;

  constructor(private readonly page: Page) {
    this.addEntryButton = page.getByRole("button", {
      name: "Add entry",
      exact: true,
    });
    this.addEntryForm = page.getByRole("form", { name: "Log an entry" });
    this.dayHeading = page.getByRole("heading", { level: 1 });
    this.previousDayButton = page.getByRole("button", {
      name: "Previous day",
      exact: true,
    });
    this.nextDayButton = page.getByRole("button", {
      name: "Next day",
      exact: true,
    });
    this.calendarToggle = page.getByRole("button", {
      name: /^(Open|Close) calendar$/,
    });
    this.calendar = page.getByRole("region", { name: "Calendar of past days" });
    this.summary = page.getByRole("region", {
      name: "Daily calorie and protein summary",
    });
    this.entriesPanel = page.getByRole("region", { name: /^Entries \d+$/ });
    this.savedEntriesPanel = page.getByRole("region", {
      name: /^Saved entries/,
    });
    this.weightPanel = page.getByRole("region", {
      name: "Weight",
      exact: true,
    });
    this.addWeightButton = page.getByRole("button", {
      name: "Add weight",
      exact: true,
    });
    this.editWeightButton = page.getByRole("button", {
      name: "Edit weight",
      exact: true,
    });
    this.weightField = page.getByLabel("Weight (kg)");
    this.sectionTabs = page.getByRole("navigation", {
      name: "Dashboard sections",
    });
    this.nutritionHideButton = page.getByRole("button", {
      name: "Hide details",
    });
    this.nutritionShowButton = page.getByRole("button", {
      name: "Show details",
    });
    this.nutritionOverview = page.getByRole("heading", {
      name: "Nutrition overview",
    });
    this.photoPreview = page.getByRole("dialog");
    this.photoPreviewCloseButton = page.getByRole("button", {
      name: "Close photo preview",
    });
  }

  async goto(): Promise<void> {
    await this.page.goto("/owner");
    await this.addEntryButton.waitFor();
  }

  /** Open the dashboard at one of its sections, as a link to `#section` does. */
  async gotoSection(section: string): Promise<void> {
    await this.page.goto(`/owner#${section}`);
    await this.addEntryButton.waitFor();
  }

  // The day in view

  async goToPreviousDay(count = 1): Promise<void> {
    for (let step = 0; step < count; step++) {
      const before = await this.dayHeading.innerText();
      await this.previousDayButton.click();
      await this.dayHeading.filter({ hasNotText: before }).waitFor();
    }
  }

  async goToNextDay(count = 1): Promise<void> {
    for (let step = 0; step < count; step++) {
      const before = await this.dayHeading.innerText();
      await this.nextDayButton.click();
      await this.dayHeading.filter({ hasNotText: before }).waitFor();
    }
  }

  /** The heading of the day in view, such as "Thursday, August 20, 2026". */
  dayHeadingOf(date: Date): Locator {
    return this.page.getByRole("heading", {
      level: 1,
      name: fullDayLabel(date),
    });
  }

  /** The selected day's button among the recent days. Only the day in view is pressed. */
  recentDayButton(date: Date, options: { pressed?: boolean } = {}): Locator {
    return this.page.getByRole("button", {
      name: fullDayLabel(date),
      ...options,
    });
  }

  // The calendar

  async openCalendar(): Promise<void> {
    await this.page
      .getByRole("button", { name: "Open calendar", exact: true })
      .click();
    await this.calendar.waitFor();
  }

  async closeCalendar(): Promise<void> {
    await this.calendar
      .getByRole("button", { name: "Close calendar", exact: true })
      .click();
    await this.calendar.waitFor({ state: "hidden" });
  }

  calendarMonthHeading(): Locator {
    return this.calendar.getByRole("heading");
  }

  calendarPreviousMonthButton(): Locator {
    return this.calendar.getByRole("button", { name: "Previous month" });
  }

  calendarNextMonthButton(): Locator {
    return this.calendar.getByRole("button", { name: "Next month" });
  }

  /** The button of one day in the calendar. It names the calories and protein of the day. */
  calendarDay(date: Date, options: { pressed?: boolean } = {}): Locator {
    return this.calendar.getByRole("button", {
      name: new RegExp(`^${fullDayLabel(date)}:`),
      ...options,
    });
  }

  /** Show the month of a day in the open calendar, whichever month it shows first. */
  async showCalendarMonth(date: Date): Promise<void> {
    const target = monthFormat.format(date);
    const heading = this.calendarMonthHeading();
    for (let step = 0; step < 24; step++) {
      const shown = (await heading.innerText()).trim();
      if (shown === target) {
        break;
      }
      const goBack =
        Date.parse(`1 ${shown} UTC`) > Date.parse(`1 ${target} UTC`);
      await (
        goBack
          ? this.calendarPreviousMonthButton()
          : this.calendarNextMonthButton()
      ).click();
    }
  }

  /** Open an older day through the calendar. */
  async openDayFromCalendar(date: Date): Promise<void> {
    await this.openCalendar();
    await this.showCalendarMonth(date);
    await this.calendarDay(date).click();
    await this.calendar.waitFor({ state: "hidden" });
    await this.dayHeadingOf(date).waitFor();
  }

  // Entries

  /** The entry with this name, in the list of the selected day. */
  entry(name: string): Locator {
    return this.page.getByRole("article", { name, exact: true });
  }

  /** The energy and macro values of an entry, as one text such as "Energy95 kcal". */
  entryMacros(name: string): Locator {
    return this.entry(name).getByLabel("Entry macros");
  }

  /** A text inside an entry, such as its description. */
  entryText(entryName: string, text: string): Locator {
    return this.entry(entryName).getByText(text, { exact: true });
  }

  /** The calories total of the day in view, as the summary shows it: "500" of "500 / 2,400". */
  calorieTotal(calories: number): Locator {
    return this.summary.getByText(
      new RegExp(`^${calories.toLocaleString("en-US")} /`),
    );
  }

  proteinTotal(protein: number): Locator {
    return this.summary.getByText(
      new RegExp(`^${protein.toLocaleString("en-US")}g /`),
    );
  }

  /** A button of an entry. Its action is "Edit", "Delete", "Duplicate", "Copy to today", or a label of the editor. */
  entryButton(entryName: string, action: string): Locator {
    const named: Record<string, string> = {
      Edit: `Edit ${entryName}`,
      Delete: `Delete ${entryName}`,
      Duplicate: `Duplicate ${entryName}`,
      "Copy to today": `Copy ${entryName} to today`,
    };
    return this.entry(entryName).getByRole("button", {
      name: named[action] ?? action,
      exact: true,
    });
  }

  async openEntryForm(): Promise<void> {
    await this.addEntryButton.click();
    await this.addEntryForm.waitFor();
  }

  entryFormField(label: string): Locator {
    return this.addEntryForm.getByLabel(label, { exact: true });
  }

  entryFormNutrient(label: string): Locator {
    return this.addEntryForm.getByRole("spinbutton", {
      name: new RegExp(`^${label} \\(`),
    });
  }

  entryFormError(message: string): Locator {
    return this.page.getByText(message, { exact: true });
  }

  async fillEntryForm(entry: NewEntry): Promise<void> {
    const form = this.addEntryForm;
    if (entry.time !== undefined) {
      await form.getByLabel("Entry time").fill(entry.time);
    }
    if (entry.type !== undefined) {
      await form.getByLabel("Entry type").selectOption({ label: entry.type });
    }
    await this.entryFormField("Entry name").fill(entry.name);
    if (entry.description !== undefined) {
      await this.entryFormField("Description").fill(entry.description);
    }
    const numbers: Array<[string, number | undefined]> = [
      ["Calories", entry.calories],
      ["Protein (g)", entry.protein],
      ["Carbs (g)", entry.carbs],
      ["Fat (g)", entry.fat],
    ];
    for (const [label, value] of numbers) {
      if (value !== undefined) {
        await this.entryFormField(label).fill(String(value));
      }
    }
    const nutrients = Object.entries(entry.nutrients ?? {});
    if (nutrients.length > 0) {
      await form.getByText("Advanced nutrition", { exact: true }).click();
      for (const [label, value] of nutrients) {
        await this.entryFormNutrient(label).fill(String(value));
      }
    }
    if (entry.photo !== undefined) {
      await form.getByLabel("Photo (optional)").setInputFiles(entry.photo);
    }
  }

  async saveEntryForm(): Promise<void> {
    await this.addEntryForm
      .getByRole("button", { name: "Save entry", exact: true })
      .click();
  }

  async addEntry(entry: NewEntry): Promise<void> {
    await this.openEntryForm();
    await this.fillEntryForm(entry);
    await this.saveEntryForm();
    await this.entry(entry.name).first().waitFor();
    await this.entry(entry.name)
      .first()
      .getByRole("status")
      .waitFor({ state: "hidden" });
  }

  async editEntry(name: string): Promise<void> {
    await this.entryButton(name, "Edit").click();
    await this.entryEditorField(name, "Calories").waitFor();
  }

  /** A field of the open editor of an entry. */
  entryEditorField(entryName: string, label: string): Locator {
    return this.entry(entryName).getByLabel(label, { exact: true });
  }

  async changeEntry(name: string, changes: EntryChanges): Promise<void> {
    await this.editEntry(name);
    await this.fillEntryEditor(name, changes);
    await this.saveEntryEditor(name);
  }

  async fillEntryEditor(name: string, changes: EntryChanges): Promise<void> {
    const field = (label: string) => this.entryEditorField(name, label);
    if (changes.name !== undefined) {
      await field("Name").fill(changes.name);
    }
    if (changes.description !== undefined) {
      await field("Description").fill(changes.description);
    }
    if (changes.type !== undefined) {
      await this.entry(name)
        .getByLabel("Entry type")
        .selectOption({ label: changes.type });
    }
    const numbers: Array<[string, number | undefined]> = [
      ["Calories", changes.calories],
      ["Protein", changes.protein],
      ["Carbs", changes.carbs],
      ["Fat", changes.fat],
    ];
    for (const [label, value] of numbers) {
      if (value !== undefined) {
        await field(label).fill(String(value));
      }
    }
  }

  async saveEntryEditor(name: string): Promise<void> {
    await this.entryButton(name, "Save changes").click();
    await this.entryButton(name, "Save changes").waitFor({ state: "hidden" });
  }

  /** Delete an entry. The page asks first; `confirm: false` declines. */
  async deleteEntry(
    name: string,
    options: { confirm: boolean },
  ): Promise<void> {
    this.page.once("dialog", (dialog) => {
      void (options.confirm ? dialog.accept() : dialog.dismiss());
    });
    await this.entryButton(name, "Delete").click();
    if (options.confirm) {
      await this.entry(name).waitFor({ state: "hidden" });
    }
  }

  /** The text under a day that has no entries. */
  emptyDayNotice(): Locator {
    return this.page.getByText(/^No entries logged for /);
  }

  async copyEntryToToday(name: string): Promise<void> {
    await this.entryButton(name, "Copy to today").click();
    await this.copiedNotice(name).waitFor();
  }

  copiedNotice(name: string): Locator {
    return this.page.getByText(`Copied “${name}” to today.`, { exact: true });
  }

  async duplicateEntry(name: string): Promise<void> {
    const before = await this.entriesNamed(name).count();
    await this.entryButton(name, "Duplicate").first().click();
    await this.entriesNamed(name).nth(before).waitFor();
  }

  /** Every entry with this name, when a duplicate gives a day more than one. */
  entriesNamed(name: string): Locator {
    return this.entry(name);
  }

  // Nutrition details of an entry

  async openNutritionDetails(name: string): Promise<void> {
    await this.entryButton(name, "Nutrition details").click();
    await this.entry(name)
      .getByRole("heading", { name: "Food items" })
      .waitFor();
  }

  async closeNutritionDetails(name: string): Promise<void> {
    await this.entryButton(name, "Hide nutrition details").click();
    await this.entryButton(name, "Nutrition details").waitFor();
  }

  nutritionDetailsOf(name: string): Locator {
    return this.entry(name).getByRole("heading", { name: "Food items" });
  }

  // Saved entries

  async saveEntryForLater(name: string): Promise<void> {
    await this.page
      .getByRole("button", { name: `Add ${name} to saved entries` })
      .click();
  }

  savedEntryButton(name: string): Locator {
    return this.page.getByRole("button", {
      name: `Add ${name} to saved entries`,
    });
  }

  async trackSavedEntry(): Promise<void> {
    await this.savedEntriesPanel
      .getByRole("button", { name: "Track now", exact: true })
      .click();
  }

  async removeSavedEntry(): Promise<void> {
    await this.savedEntriesPanel
      .getByRole("button", { name: "Remove", exact: true })
      .click();
  }

  // Photos

  photoThumbnail(name: string): Locator {
    return this.page.getByRole("button", {
      name: `View photo of ${name}`,
      exact: true,
    });
  }

  // Weight

  async saveWeight(
    kilograms: number,
    options: { editing: boolean },
  ): Promise<void> {
    await (
      options.editing ? this.editWeightButton : this.addWeightButton
    ).click();
    await this.weightField.fill(String(kilograms));
    await this.weightPanel.getByRole("button", { name: /^Save/ }).click();
    await this.editWeightButton.waitFor();
  }

  // Trends

  trendPanel(title: string): Locator {
    return this.page.getByRole("region", { name: title, exact: true });
  }

  /** The text of an empty chart, such as "No weight records for the past 7 days". */
  emptyTrendNotice(message: string): Locator {
    return this.page.getByText(message, { exact: true });
  }

  /** The chart of the nutrient trend, named after its nutrient. */
  nutrientTrendChart(nutrient: string): Locator {
    return this.trendPanel("Nutrient trend").getByRole("group", {
      name: `${nutrient} for the past 7 days; missing days are shown as gaps`,
    });
  }

  /** The select that picks the nutrient of the nutrient trend. */
  nutrientTrendChoice(): Locator {
    return this.trendPanel("Nutrient trend").getByLabel("Show", {
      exact: true,
    });
  }

  trendRange(label: string): Locator {
    return this.page.getByLabel(`${label} range`);
  }

  /** The buttons of a chart, one for each day. */
  trendDays(title: string, name?: RegExp): Locator {
    return this.trendPanel(title).getByRole("button", name ? { name } : {});
  }

  trendDay(title: string, date: Date): Locator {
    return this.trendPanel(title).getByRole("button", {
      name: new RegExp(`^${shortDayLabel(date)}:`),
    });
  }

  // Sections

  sectionTab(section: DashboardSection): Locator {
    return this.sectionTabs.getByRole("link", { name: section, exact: true });
  }
}
