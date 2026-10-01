import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

const TREND_COLUMNS = [".bar-column", ".protein-target-day", ".weight-point-column", ".macro-trend-column", ".nutrient-trend-column"];

test("every trend panel follows the shared 7 or 30 day range", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  for (const selector of TREND_COLUMNS) await expect(page.locator(selector)).toHaveCount(7);

  await page.getByLabel("Calorie trend range").selectOption("30");
  for (const selector of TREND_COLUMNS) await expect(page.locator(selector)).toHaveCount(30);
  for (const label of ["Protein versus target range", "Weight trend range", "Macros trend range", "Nutrient trend range"]) {
    await expect(page.getByLabel(label)).toHaveValue("30");
  }

  await page.getByLabel("Nutrient trend range").selectOption("7");
  for (const selector of TREND_COLUMNS) await expect(page.locator(selector)).toHaveCount(7);
  await expect(page.getByLabel("Calorie trend range")).toHaveValue("7");
});

test("the macros trend shows each day's split and marks days without data", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  // 50 g carbs, 30 g protein and 20 g fat are 200, 120 and 180 of 500 kcal.
  await expect(page.locator('.macro-trend-column[aria-label="Sep 12: 40% carbohydrates, 24% protein, 36% fat"]')).toHaveCount(1);
  await expect(page.locator('.macro-trend-column[aria-label$="no macro data"]')).toHaveCount(6);

  state.meals = [];
  await page.reload();
  await expect(page.getByText("No macro records for the past 7 days")).toBeVisible();
});

test("the nutrient trend plots known days and marks unknown days as gaps", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  const panel = page.locator("#nutrient-trend");
  await expect(panel.getByRole("group", { name: "Fiber for the past 7 days; missing days are shown as gaps" })).toBeVisible();
  await expect(panel.locator('.nutrient-trend-column[aria-label^="Sep 12: 4 g"]')).toHaveCount(1);
  await expect(panel.locator(".nutrient-trend-column.missing")).toHaveCount(6);
  await expect(panel.locator(".nutrient-trend-summary")).toContainText("1 of 7 days known · Partial");

  // The chosen nutrient has no values, so every day is a gap.
  await panel.getByLabel("Show", { exact: true }).selectOption("caffeineMg");
  await expect(panel.locator(".nutrient-trend-column.missing")).toHaveCount(7);
  await expect(panel.locator(".nutrient-trend-summary")).toContainText("0 of 7 days known");
});

test("the nutrient trend calls a guideline a limit and a plain Daily Value a reference", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  const panel = page.locator("#nutrient-trend");
  await expect(panel.locator(".nutrient-trend-summary")).toContainText("Daily goal 28 g");

  await panel.getByLabel("Show", { exact: true }).selectOption("sodiumMg");
  await expect(panel.locator(".nutrient-trend-summary")).toContainText("Daily limit 2,300 mg");
  await expect(panel.locator(".nutrient-trend-goal-line")).toHaveText("Limit");

  await panel.getByLabel("Show", { exact: true }).selectOption("cholesterolMg");
  await expect(panel.locator(".nutrient-trend-summary")).toContainText("Daily reference 300 mg");
  await expect(panel.locator(".nutrient-trend-goal-line")).toHaveText("Reference");
});
