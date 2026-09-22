import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test("adult B6 upper-limit comparison requires an explicit private opt-in", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
  const state = await mockDashboardApi(page);
  const meal = structuredClone(state.meals[0]);
  meal.id = "b6-previous-day";
  meal.consumedAt = Date.parse("2026-09-11T12:00:00Z");
  Object.assign(meal.items[0], { vitaminB6Mg: 120 });
  state.meals.push(meal);

  await page.goto("/");
  const attention = page.getByRole("region", { name: "Nutrition attention" });
  await expect(attention.getByRole("option", { name: /Vitamin B6.*upper limit/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Open settings" }).click();
  const setting = page.getByRole("checkbox", { name: /use the U.S. adult vitamin B6 upper limit/i });
  await expect(setting).not.toBeChecked();
  await page.getByRole("dialog", { name: "Daily targets" }).screenshot({ path: testInfo.outputPath("nutrition-reference-setting.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("dialog", { name: "Daily targets" }).screenshot({ path: testInfo.outputPath("nutrition-reference-setting-mobile.png") });
  await setting.check();
  await page.getByRole("button", { name: "Save targets" }).click();
  await expect.poll(() => state.settings.vitaminB6UsFnbAdultUlEnabled).toBe(true);

  await attention.getByRole("combobox", { name: "Select excess nutrient" }).selectOption("vitaminB6Mg:upper-limit");
  await expect(attention).toContainText("1 of 1 observed days above 100 mg");
  await expect(attention).toContainText("U.S. National Academies / NIH ODS");
  await attention.getByRole("button", { name: "Inspect entry" }).first().click();
  await expect(page.locator(".inline-editor")).toBeVisible();

  await page.goto("/?public");
  await expect(page.getByRole("region", { name: "Nutrition attention" }).getByRole("option", { name: /Vitamin B6.*upper limit/ })).toHaveCount(0);
});

test("source-specific adult limit uses recorded form amount throughout the chart and drilldown", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
  const state = await mockDashboardApi(page);
  const meal = structuredClone(state.meals[0]);
  meal.id = "vitamin-a-previous-day";
  meal.consumedAt = Date.parse("2026-09-11T12:00:00Z");
  meal.items[0].name = "Vitamin A supplement";
  Object.assign(meal.items[0], { vitaminAMcgRae: 5_000, preformedVitaminAMcgRae: 3_500 });
  state.meals.push(meal);

  await page.goto("/");
  const attention = page.getByRole("region", { name: "Nutrition attention" });
  await expect(attention.getByRole("option", { name: /Vitamin A.*upper limit/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("checkbox", { name: /use applicable U.S. nutrient upper limits/i }).check();
  await page.getByRole("button", { name: "Save targets" }).click();
  await expect.poll(() => state.settings.usFnbAdultUlEnabled).toBe(true);

  await attention.getByRole("combobox", { name: "Select excess nutrient" }).selectOption("vitaminAMcgRae:upper-limit");
  await expect(attention).toContainText("1 of 1 observed days above 3,000 mcg");
  await expect(attention.locator(".nutrition-excess-day")).toContainText("3,500 mcg");
  await expect(attention.locator(".nutrition-source-detail")).toContainText("Vitamin A supplement");
  await expect(attention.locator(".nutrition-source-detail")).toContainText("3,500 mcg");
  await expect(attention.locator(".nutrition-excess-day")).not.toContainText("5,000 mcg");

  await page.goto("/?public");
  await expect(page.getByRole("region", { name: "Nutrition attention" }).getByRole("option", { name: /Vitamin A.*upper limit/ })).toHaveCount(0);
});
