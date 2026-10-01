import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

test("the section tabs appear on small screens and follow the URL hash", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Dashboard sections" });
  await expect(nav).toBeHidden();

  await page.setViewportSize({ width: 600, height: 900 });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Today", exact: true })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Entries", exact: true }).click();
  await expect(page).toHaveURL(/#meals$/);
  await expect(nav.getByRole("link", { name: "Entries", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Entries", exact: true })).toHaveClass(/active/);
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

  for (const [name, hash] of [["Trend", "trend"], ["Macros", "macros"], ["Nutrition", "nutrition"]]) {
    await page.goto(`/#${hash}`);
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  }
});

test("the nutrition section collapses, remembers the choice, and holds the nutrient trend", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  const content = page.locator("#nutrition-details-content");
  const toggle = page.getByRole("button", { name: "Hide details" });
  await expect(content).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveAttribute("aria-controls", "nutrition-details-content");
  await expect(content.locator("#nutrient-trend")).toBeVisible();
  await expect(content.getByRole("heading", { name: "Vitamins" })).toBeVisible();

  await toggle.click();
  await expect(content).toBeHidden();
  await expect(page.getByRole("button", { name: "Show details" })).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("calocount:nutrition-collapsed"))).toBe("true");

  await page.reload();
  await expect(page.locator(".calories-card .metric-value")).toContainText("500");
  await expect(content).toBeHidden();
  await page.getByRole("button", { name: "Show details" }).click();
  await expect(content).toBeVisible();
});

test("an entry's nutrition details list its items, including on the public view", async ({ page }) => {
  await mockDashboardApi(page);
  for (const path of ["/", "/?public"]) {
    await page.goto(path);
    await page.getByRole("button", { name: "Nutrition details", exact: true }).click();
    const card = page.locator(".meal-nutrition-detail-card");
    await expect(card.getByRole("heading", { name: "Food items" })).toBeVisible();
    await expect(card.locator(".meal-item-detail")).toHaveCount(1);
    await expect(card.locator(".meal-item-nutrients")).toContainText("Fiber 4 g");
    // An unknown value stays unknown instead of showing zero.
    await expect(card.locator(".meal-item-nutrients")).toContainText("Caffeine —");
    await page.getByRole("button", { name: "Hide nutrition details", exact: true }).click();
    await expect(card).toHaveCount(0);
  }
});

test("the compact panels come before saved entries and the day's entries", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator(".meals-panel")).toBeVisible();
  const order = await page.locator(".weight-panel, .macro-panel, .history-panel, .saved-entries-panel, .meals-panel")
    .evaluateAll((panels) => panels.map((panel) => [...panel.classList].find((name) => name.endsWith("-panel") && name !== "compact-dashboard-panel")));
  expect(order).toEqual(["weight-panel", "macro-panel", "history-panel", "saved-entries-panel", "meals-panel"]);
});
