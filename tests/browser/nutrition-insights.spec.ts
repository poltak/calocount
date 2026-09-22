import { expect, test, type Page } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

async function seedNutrition(page: Page) {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
  const state = await mockDashboardApi(page);
  const template = structuredClone(state.meals[0]);
  for (let offset = 1; offset <= 12; offset += 1) {
    const date = new Date(Date.parse(state.date) - offset * 86_400_000).toISOString().slice(0, 10);
    const meal = structuredClone(template);
    meal.id = `nutrition-${offset}`;
    meal.consumedAt = Date.parse(`${date}T12:00:00Z`);
    meal.caption = offset % 2 ? "Rice and beans" : "Yogurt bowl";
    meal.items[0].name = meal.caption;
    meal.items[0].fiberG = 5;
    Object.assign(meal.items[0], { sodiumMg: 2_600, saturatedFatG: 25, calciumMg: 200 });
    if (offset <= 2) {
      meal.items.push({ ...meal.items[0], name: "Unmeasured side", fiberG: null });
    }
    state.meals.push(meal);
  }
  return state;
}

test("nutrition insights explain persistent gaps, excesses and food sources", async ({ page }, testInfo) => {
  const state = await seedNutrition(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?public");

  const attention = page.getByRole("region", { name: "Nutrition attention" });
  await expect(attention.getByRole("heading", { name: "Persistent shortfalls" })).toBeVisible();
  await expect(attention.getByRole("button", { name: /Fiber/ }).first()).toBeVisible();
  await expect(attention).toContainText("12 of 12 observed days above");
  await attention.getByRole("button", { name: /Fiber/ }).first().click();
  await expect(attention).toContainText("10 complete logged days");
  await attention.getByRole("button", { name: "28 days", exact: true }).click();
  await expect(attention).toContainText("No persistent shortfalls yet");
  await attention.getByRole("button", { name: "14 days", exact: true }).click();
  await attention.getByRole("button", { name: /Show all coverage/ }).click();
  await expect(attention.getByText("Vitamin B12", { exact: true })).toBeVisible();
  await attention.screenshot({ path: testInfo.outputPath("nutrition-attention-desktop.png") });

  const food = page.getByRole("region", { name: "Nutrition food insights" });
  await expect(food.getByRole("heading", { name: "Compare a food change" })).toBeVisible();
  await food.getByLabel("Change type").selectOption("replacement");
  await expect(food).toContainText("Replacing");
  await food.getByLabel("Change type").selectOption("addition");
  await food.getByRole("button", { name: "1.5×" }).click();
  await expect(food).toContainText("at 1.5× the logged portion");
  await food.getByRole("combobox", { name: "Nutrient", exact: true }).selectOption("sodiumMg");
  await expect(food).toContainText("recorded known sodium");
  await food.getByRole("button", { name: "Exclude" }).first().click();
  await expect(food).toContainText("Hypothetical exclusion");
  await food.screenshot({ path: testInfo.outputPath("nutrition-food-desktop.png") });
  expect(state.writes).toBe(0);
});

test("nutrition insights fit a dark mobile viewport", async ({ page }, testInfo) => {
  await seedNutrition(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?public");
  const attention = page.getByRole("region", { name: "Nutrition attention" });
  const food = page.getByRole("region", { name: "Nutrition food insights" });
  await expect(attention).toBeVisible();
  await expect(food).toBeVisible();
  await attention.screenshot({ path: testInfo.outputPath("nutrition-attention-mobile-dark.png") });
  await food.screenshot({ path: testInfo.outputPath("nutrition-food-mobile-dark.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
