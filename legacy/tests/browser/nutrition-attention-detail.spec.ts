import { expect, test, type Page } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

async function seedNutritionAttention(page: Page) {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
  const state = await mockDashboardApi(page);
  const template = structuredClone(state.meals[0]);
  for (let offset = 1; offset <= 12; offset += 1) {
    const date = new Date(Date.parse(state.date) - offset * 86_400_000).toISOString().slice(0, 10);
    const meal = structuredClone(template);
    meal.id = `attention-${offset}`;
    meal.consumedAt = Date.parse(`${date}T12:00:00Z`);
    meal.caption = offset % 2 ? "Rice and beans" : "Yogurt bowl";
    meal.items[0].name = meal.caption;
    meal.items[0].fiberG = 5;
    Object.assign(meal.items[0], { sodiumMg: 2_600, saturatedFatG: 25, calciumMg: 200 });
    if (offset <= 2) meal.items.push({ ...meal.items[0], name: "Unmeasured side", fiberG: null });
    state.meals.push(meal);
  }
  return state;
}

test("nutrition attention exposes daily exclusions, references, and selected-day sources", async ({ page }, testInfo) => {
  await seedNutritionAttention(page);
  await page.goto("/?public");

  const attention = page.getByRole("region", { name: "Nutrition attention" });
  await attention.getByRole("button", { name: /Fiber/ }).first().click();
  await expect(attention.getByText("Daily recorded values")).toBeVisible();
  await expect(attention.getByRole("button", { name: /Sep 10.*excluded from the mean/i })).toBeVisible();

  await attention.getByText("Reference details", { exact: true }).first().click();
  await expect(attention).toContainText("FDA Daily Value");

  await attention.getByRole("button", { name: /Sep 10.*excluded from the mean/i }).click();
  await expect(attention.getByText("Selected day")).toBeVisible();
  await expect(attention).toContainText("Rice and beans");

  await attention.getByRole("button", { name: "Compare a food change for Fiber" }).click();
  await expect(page.getByRole("region", { name: "Nutrition food insights" })).toContainText("Focused finding: Fiber");

  await attention.getByText("How to read coverage and provenance", { exact: true }).click();
  await expect(attention.getByText(/explicit nutrientProvenance field identifies/)).toBeVisible();
  await attention.getByText("Why some nutrients have no upper-limit alert", { exact: true }).click();
  await expect(attention.getByText(/Vitamin B12 · upper-limit status/)).toBeVisible();
  await expect(attention).toContainText("No established upper limit is available");
  await attention.screenshot({ path: testInfo.outputPath("attention-detail.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});

test("owner mode can inspect and edit an older missing-value entry", async ({ page }) => {
  const state = await seedNutritionAttention(page);
  const historical = state.meals.find((meal) => meal.id === "attention-12")!;
  historical.caption = "Missing fiber history";
  historical.items[0].name = historical.caption;
  historical.items[0].fiberG = null;
  await page.route("**/api/meals/attention-12", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { meal: historical } });
      return;
    }
    await route.fallback();
  });

  await page.goto("/");
  const attention = page.getByRole("region", { name: "Nutrition attention" });
  const fiberCoverage = attention.locator(".nutrition-coverage-row").filter({ hasText: "Fiber" }).first();
  await fiberCoverage.locator("summary").click();

  const historicalRow = fiberCoverage.locator(".nutrition-attention__missing-list li").filter({ hasText: "Missing fiber history" });
  await expect(historicalRow).toContainText("Aug 31");
  await historicalRow.getByRole("button", { name: "Inspect entry" }).click();

  const editor = page.locator("#historical-meal-editor");
  await expect(editor.getByRole("heading", { name: "Edit historical entry" })).toBeVisible();
  await expect(editor).toContainText("Missing fiber history");
  await editor.getByLabel("Name").fill("Edited historical meal");
  await editor.getByText("Advanced nutrition").click();
  await editor.getByLabel("Fiber (g)").fill("8");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(() => state.meals.find((meal) => meal.id === "attention-12")?.items[0].fiberG).toBe(8);
  await expect(historicalRow).toHaveCount(0);
});

test("source drilldown keeps long item names inside the card on a phone", async ({ page }) => {
  const state = await seedNutritionAttention(page);
  for (const meal of state.meals) {
    meal.items[0].name = "Bún bò Huế thập cẩm (all toppings, 1/3 noodles, lots of vegetables, extra herbs, no fish sauce, chilli on the side)";
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?public");

  const attention = page.getByRole("region", { name: "Nutrition attention" });
  await attention.locator(".nutrition-excess-day").first().click();
  const detail = attention.locator(".nutrition-source-detail");
  await expect(detail.getByText("Source drilldown")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".nutrition-source-detail")!;
    const rows = [...card.querySelectorAll<HTMLElement>(".nutrition-source-list button")];
    const cardRight = card.getBoundingClientRect().right;
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      cardOverflow: card.scrollWidth - card.clientWidth,
      rowsPastCard: rows.filter((row) => row.getBoundingClientRect().right > cardRight + 1).length,
      rowCount: rows.length,
    };
  });
  expect(metrics.rowCount, JSON.stringify(metrics)).toBeGreaterThan(0);
  expect(metrics.documentWidth, `The page scrolls horizontally: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.cardOverflow, `The card content overflows: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(0);
  expect(metrics.rowsPastCard, `Rows extend past the card: ${JSON.stringify(metrics)}`).toBe(0);
});
