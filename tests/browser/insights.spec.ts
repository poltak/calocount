import { expect, test, type Page } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

async function seedInsights(page: Page) {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
  const state = await mockDashboardApi(page);
  const template = structuredClone(state.meals[0]);
  for (let offset = 1; offset <= 14; offset++) {
    const currentWeek = offset <= 7;
    const date = new Date(Date.parse(state.date) - offset * 86_400_000).toISOString().slice(0, 10);
    for (const drink of [false, true]) {
      const meal = structuredClone(template);
      meal.id = `${drink ? "coffee" : "food"}-${offset}`;
      meal.consumedAt = Date.parse(`${date}T${drink ? "08" : "12"}:00:00Z`);
      meal.caption = drink ? "Coffee with milk" : "Rice and chicken";
      meal.items[0].name = meal.caption;
      meal.totalCalories = meal.items[0].calories = drink ? currentWeek ? 150 : 100 : offset === 14 ? 4200 : 2100;
      meal.totalProteinG = meal.items[0].proteinG = drink ? 5 : offset === 1 ? 175 : 150;
      meal.items[0].fiberG = drink ? null : 32;
      meal.items[0].caffeineMg = drink ? currentWeek ? 120 : 80 : null;
      state.meals.push(meal);
    }
  }
  return state;
}

test("insights inspect historical food and drink logs, scale outliers, and explain nutrient changes", async ({ page }, testInfo) => {
  const state = await seedInsights(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?public");
  const repeat = page.getByRole("region", { name: "Days worth repeating" });
  await expect(repeat.locator(".repeat-point")).toHaveCount(14);
  await expect(repeat.locator(".repeat-point.joint")).toHaveCount(1);
  await repeat.getByLabel("Inspect a day").selectOption("2026-08-29");
  await expect(repeat.locator(".repeat-details")).toContainText("Coffee with milk");
  await expect(repeat.locator(".repeat-details")).toContainText("179% of the current calorie target");
  const outlier = repeat.getByRole("button", { name: /August 29|Aug 29/ });
  const xPosition = await outlier.evaluate((element: HTMLElement) => Number.parseFloat(element.style.left));
  expect(xPosition).toBeGreaterThan(70);
  expect(xPosition).toBeLessThan(100);
  await repeat.getByLabel("Vertical axis").selectOption("fiber");
  await expect(repeat.locator(".days-repeat-summary")).toContainText("partial fiber coverage");
  await repeat.screenshot({ path: testInfo.outputPath("days-light.png") });

  const weekly = page.getByRole("region", { name: "What changed this week?" });
  await expect(weekly).toContainText("7/7 recorded days");
  await weekly.getByRole("button", { name: /^Caffeine/ }).click();
  await expect(weekly.locator(".weekly-breakdown")).toContainText("caffeine");
  await weekly.locator(".weekly-contribution-list").getByRole("button", { name: /Coffee with milk/ }).click();
  await expect(weekly.locator(".weekly-source-detail")).toContainText("Coffee with milk");
  await expect(weekly.locator(".weekly-source-detail")).not.toContainText("entry coffee-");
  await weekly.screenshot({ path: testInfo.outputPath("weekly-light.png") });

  const frequency = page.getByRole("region", { name: "Frequency & amount" });
  await frequency.getByRole("button", { name: "7 days", exact: true }).click();
  await frequency.getByRole("combobox", { name: /Amount/ }).selectOption("caffeineMg");
  await frequency.locator(".frequency-portion__food-list").getByRole("button", { name: /Coffee with milk/ }).click();
  await expect(frequency.locator(".frequency-portion__details")).toContainText("840 mg");
  await expect(frequency.locator(".frequency-portion__details")).toContainText("120 mg");
  await frequency.screenshot({ path: testInfo.outputPath("frequency-light.png") });
  expect(state.writes).toBe(0);
});

test("new charts work on mobile in dark mode and refresh after a food log is deleted", async ({ page }, testInfo) => {
  const state = await seedInsights(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const repeat = page.getByRole("region", { name: "Days worth repeating" });
  await repeat.getByLabel("Inspect a day").selectOption("2026-09-11");
  await expect(repeat.locator(".repeat-details li")).toHaveCount(2);
  await repeat.screenshot({ path: testInfo.outputPath("days-mobile-dark.png") });
  const weekly = page.getByRole("region", { name: "What changed this week?" });
  await weekly.screenshot({ path: testInfo.outputPath("weekly-mobile-dark.png") });
  const frequency = page.getByRole("region", { name: "Frequency & amount" });
  await frequency.screenshot({ path: testInfo.outputPath("frequency-mobile-dark.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);

  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Coffee with milk", exact: true }).click();
  await expect.poll(() => state.meals.some((entry) => entry.id === "coffee-1")).toBe(false);
  await expect(repeat.locator(".repeat-details li")).toHaveCount(1);
  await expect(repeat.locator(".repeat-details")).not.toContainText("Coffee with milk");
});
