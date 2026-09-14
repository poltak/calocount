import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

test("deleting a meal updates both daily totals and the loaded trend", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator(".calories-card .metric-value")).toContainText("500");
  await expect(page.locator('.bar-column[aria-label*="500 kilocalories"]')).toHaveCount(1);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Audit lunch", exact: true }).click();
  await expect(page.locator(".calories-card .metric-value")).toHaveText("0 / 2,400");
  await expect(page.locator('.bar-column[aria-label*="500 kilocalories"]')).toHaveCount(0);
});

test("saving an earlier weight keeps the selected day", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await page.getByRole("button", { name: "Edit weight", exact: true }).click();
  await page.locator('input[name="weightKg"]').fill("72");
  await page.locator(".weight-form").getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => state.summaryReads).toBeGreaterThan(1);
  await expect(page.locator("#today")).toContainText("September 11");
  await expect(page.locator(".weight-reading")).toContainText("72");
});

test("a focus refresh updates external changes and keeps an open draft", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Edit Audit lunch", exact: true }).click();
  const title = page.locator('.inline-editor').getByLabel("Name", { exact: true });
  await title.fill("Unsaved title");
  const reads = state.summaryReads;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => state.summaryReads).toBeGreaterThan(reads);
  await expect(title).toHaveValue("Unsaved title");
});

test("the current day advances at midnight without a page reload", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.clock.setSystemTime(new Date("2026-09-12T23:59:30Z"));
  await page.goto("/");
  await expect(page.locator("#today")).toContainText("September 12");
  state.date = "2026-09-13";
  await page.clock.fastForward(60_000);
  await expect(page.locator("#today")).toContainText("September 13");
});

test("invalid summary data produces an error instead of made-up zeros", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.invalidSummary = true;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your dashboard is unavailable" })).toBeVisible();
});

test("the public dashboard has no write controls", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/?public");
  await expect(page.locator(".calories-card .metric-value")).toContainText("500");
  await expect(page.getByRole("link", { name: "Open owner view", exact: true })).toHaveAttribute("href", "/owner");
  await expect(page.getByRole("button", { name: "Open settings" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete Audit lunch" })).toHaveCount(0);
  expect(state.writes).toBe(0);
});

test("theme choices persist and System follows live operating system changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("radio", { name: "System", exact: true })).toBeChecked();

  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("calocount:theme"))).toBe("dark");

  await page.getByRole("radio", { name: "System", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("light mode gives dashboard secondary surfaces readable colors", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.locator(".weight-reading time")).toBeVisible();

  const styles = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderTopColor, color: style.color };
    };
    return {
      weight: {
        surface: read(".weight-reading"),
        value: read(".weight-reading strong"),
        time: read(".weight-reading time"),
      },
      history: {
        row: read(".history-row.selected"),
        date: read(".history-row.selected .history-date strong"),
        calories: read(".history-row.selected .history-calories"),
        arrow: read(".history-row.selected .history-chevron"),
      },
      tip: {
        surface: read(".quick-tip"),
        text: read(".quick-tip p"),
        icon: read(".tip-icon"),
      },
    };
  });

  expect(styles.weight.surface.background).toBe("rgb(238, 243, 240)");
  expect(styles.weight.surface.border).toBe("rgb(189, 203, 195)");
  expect(styles.weight.value.color).toBe("rgb(31, 42, 42)");
  expect(styles.weight.time.color).toBe("rgb(83, 99, 93)");
  expect(styles.history.row.background).toBe("rgb(225, 240, 231)");
  expect(styles.history.date.color).toBe("rgb(70, 86, 82)");
  expect(styles.history.calories.color).toBe("rgb(70, 86, 82)");
  expect(styles.history.arrow.color).toBe("rgb(70, 86, 82)");
  expect(styles.tip.surface.background).toBe("rgb(238, 243, 240)");
  expect(styles.tip.surface.border).toBe("rgb(189, 203, 195)");
  expect(styles.tip.text.color).toBe("rgb(83, 99, 93)");
  expect(styles.tip.icon.color).toBe("rgb(53, 107, 141)");
});

test("light mode uses a coherent palette for charts and button states", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const charts = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        image: style.backgroundImage,
        border: style.borderTopColor,
        color: style.color,
      };
    };
    return {
      calories: read(".bar:not(.bar-empty)"),
      axis: read(".chart-y-axis"),
      target: read(".target-line"),
      macroDonut: read(".macro-donut"),
      macroStack: read(".macro-stack"),
      weightPoint: read(".weight-point"),
      nutrientBar: read(".nutrient-trend-bar"),
      primary: read(".primary-button"),
      date: read(".date-pill.active"),
      history: read(".history-row.selected"),
      secondary: read(".chart-range-select"),
    };
  });

  expect(charts.calories.image).toContain("rgb(227, 160, 95)");
  expect(charts.calories.image).toContain("rgb(187, 100, 31)");
  expect(charts.axis.color).toBe("rgb(104, 120, 114)");
  expect(charts.target.border).toBe("rgb(113, 139, 125)");
  expect(charts.macroDonut.image).toContain("rgb(53, 107, 141)");
  expect(charts.macroStack.background).toBe("rgb(225, 234, 229)");
  expect(charts.weightPoint.background).toBe("rgb(52, 122, 82)");
  expect(charts.nutrientBar.background).toBe("rgb(53, 107, 141)");
  expect(charts.primary.background).toBe("rgb(185, 102, 38)");
  expect(charts.date.background).toBe("rgb(225, 240, 231)");
  expect(charts.history.background).toBe("rgb(225, 240, 231)");
  expect(charts.secondary.background).toBe("rgb(238, 243, 240)");
  expect(charts.secondary.border).toBe("rgb(194, 209, 200)");

  await page.locator(".icon-button").hover();
  await expect(page.locator(".icon-button")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Close settings" }).hover();
  await expect(page.getByRole("button", { name: "Close settings" })).toHaveCSS("background-color", "rgba(31, 42, 42, 0.07)");
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("button", { name: "Add weight" }).click();
  await page.locator(".save-button").hover();
  await expect(page.locator(".save-button")).toHaveCSS("background-color", "rgb(164, 85, 27)");
  await page.locator(".cancel-button").hover();
  await expect(page.locator(".cancel-button")).toHaveCSS("background-color", "rgba(31, 42, 42, 0.07)");
});

test("a double click sends one delete and disables other actions until it ends", async ({ page }) => {
  const state = await mockDashboardApi(page);
  let release = () => {};
  state.holdWrite = new Promise<void>((resolve) => { release = resolve; });
  let confirmations = 0;
  page.on("dialog", async (dialog) => { confirmations++; await dialog.accept(); });
  await page.goto("/");
  await page.getByRole("button", { name: "Delete Audit lunch", exact: true }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect.poll(() => state.writes).toBe(1);
  expect(confirmations).toBe(1);
  await expect(page.getByRole("button", { name: "Delete Audit lunch", exact: true })).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "Open settings" })).toBeDisabled();
  release();
  await expect(page.locator(".calories-card .metric-value")).toHaveText("0 / 2,400");
  await expect(page.getByRole("button", { name: "Open settings" })).toBeEnabled();
});

test("a failed meal save keeps the draft and leaves the saved totals intact", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.failWrite = true;
  await page.goto("/");
  await page.getByRole("button", { name: "Edit Audit lunch", exact: true }).click();
  const editor = page.locator(".inline-editor");
  await editor.getByLabel("Name", { exact: true }).fill("Unsaved title");
  await editor.getByLabel("Calories", { exact: true }).fill("900");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Test save failed.", { exact: true })).toBeVisible();
  await expect.poll(() => state.summaryReads).toBeGreaterThan(1);
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue("Unsaved title");
  await expect(editor.getByLabel("Calories", { exact: true })).toHaveValue("900");
  await expect(page.locator(".calories-card .metric-value")).toHaveText("500 / 2,400");
});

test("a slow refresh cannot restore a meal after a completed delete", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator(".calories-card .metric-value")).toContainText("500");
  let release = () => {};
  state.holdSummary = new Promise<void>((resolve) => { release = resolve; });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => state.summaryReads).toBe(2);
  state.holdSummary = null;
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Audit lunch", exact: true }).click();
  await expect.poll(() => state.summaryReads).toBe(3);
  await expect(page.locator(".calories-card .metric-value")).toHaveText("0 / 2,400");
  release();
  await page.clock.fastForward(100);
  await expect(page.getByRole("button", { name: "Delete Audit lunch", exact: true })).toHaveCount(0);
  await expect(page.locator('.bar-column[aria-label*="500 kilocalories"]')).toHaveCount(0);
});

test("protein mode changes and earlier weight edits refresh the resolved target", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("radio", { name: "Grams per kilogram", exact: true }).check();
  await page.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(page.locator(".protein-card .metric-value")).toHaveText("30g / 112g");
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await page.getByRole("button", { name: "Edit weight", exact: true }).click();
  await page.locator('input[name="weightKg"]').fill("75");
  await page.locator(".weight-form").getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".protein-card .metric-value")).toHaveText("0g / 120g");
  await page.getByRole("button", { name: "Next day", exact: true }).click();
  await expect(page.locator(".protein-card .metric-value")).toHaveText("30g / 120g");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("radio", { name: "Fixed grams", exact: true }).check();
  await page.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(page.locator(".protein-card .metric-value")).toHaveText("30g / 160g");
});

test("failed weight saves roll back the reading and the trend", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.failWrite = true;
  let release = () => {};
  state.holdWrite = new Promise<void>((resolve) => { release = resolve; });
  await page.goto("/");
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await page.getByRole("button", { name: "Edit weight", exact: true }).click();
  await page.locator('input[name="weightKg"]').fill("75");
  await page.locator(".weight-form").getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".weight-reading")).toContainText("75");
  await expect(page.locator('.weight-point-column[aria-label*="75 kilograms"]')).toHaveCount(1);
  release();
  await expect(page.getByText("Test save failed.", { exact: true })).toBeVisible();
  await expect(page.locator(".weight-reading")).toContainText("70");
  await expect(page.locator('.weight-point-column[aria-label*="75 kilograms"]')).toHaveCount(0);
  await expect(page.locator('.weight-point-column[aria-label*="70 kilograms"]')).toHaveCount(1);
  await expect(page.locator('input[name="weightKg"]')).toHaveValue("75");
});

test("duplicated meals reconcile once and failed duplicates roll back", async ({ page }) => {
  const state = await mockDashboardApi(page);
  let release = () => {};
  state.holdWrite = new Promise<void>((resolve) => { release = resolve; });
  await page.goto("/");
  await page.getByRole("button", { name: "Duplicate Audit lunch", exact: true }).click();
  await expect(page.locator(".calories-card .metric-value")).toHaveText("1,000 / 2,400");
  release();
  await expect(page.getByRole("button", { name: "Duplicate Audit lunch", exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Open settings" })).toBeEnabled();
  state.failWrite = true;
  await page.getByRole("button", { name: "Duplicate Audit lunch", exact: true }).first().click();
  await expect(page.getByText("Test save failed.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Duplicate Audit lunch", exact: true })).toHaveCount(2);
  await expect(page.locator(".calories-card .metric-value")).toHaveText("1,000 / 2,400");
});

test("an invalid initial response can be retried", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.invalidSummary = true;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your dashboard is unavailable" })).toBeVisible();
  state.invalidSummary = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".calories-card .metric-value")).toHaveText("500 / 2,400");
});

test("new meals roll back after failure and a retry creates one saved meal", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.failWrite = true;
  await page.goto("/");
  await page.getByRole("button", { name: "Add meal", exact: true }).click();
  const form = page.locator(".add-meal-form");
  await form.getByLabel("Meal name", { exact: true }).fill("Apple");
  await form.getByLabel("Calories", { exact: true }).fill("100");
  await form.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page.getByText("Test save failed.", { exact: true })).toBeVisible();
  await expect(page.locator(".calories-card .metric-value")).toHaveText("500 / 2,400");
  await expect(form.getByLabel("Meal name", { exact: true })).toHaveValue("Apple");
  state.failWrite = false;
  await form.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete Apple", exact: true })).toHaveCount(1);
  await expect(page.locator(".calories-card .metric-value")).toHaveText("600 / 2,400");
  await expect(form).toHaveCount(0);
  expect(state.meals).toHaveLength(2);
});

test("copying a previous meal changes today's totals and keeps the source", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.meals[0].consumedAt -= 86_400_000;
  await page.goto("/");
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await page.getByRole("button", { name: "Copy Audit lunch to today", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy Audit lunch to today", exact: true })).toBeEnabled();
  await expect(page.locator("#today")).toContainText("September 11");
  await expect(page.locator(".calories-card .metric-value")).toHaveText("500 / 2,400");
  await page.getByRole("button", { name: "Next day", exact: true }).click();
  await expect(page.locator(".calories-card .metric-value")).toHaveText("500 / 2,400");
  await expect(page.locator('.bar-column[aria-label*="500 kilocalories"]')).toHaveCount(2);
  expect(state.meals).toHaveLength(2);
});

test("settings code loads when the owner opens the form", async ({ page }) => {
  await mockDashboardApi(page);
  const settingsRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/app/settings-panel.tsx")) settingsRequests.push(request.url());
  });
  await page.goto("/?public");
  await expect(page.locator(".calories-card .metric-value")).toContainText("500");
  expect(settingsRequests).toHaveLength(0);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
  expect(settingsRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("dialog", { name: "Daily targets" })).toBeVisible();
  expect(settingsRequests).toHaveLength(1);
});
