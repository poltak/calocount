import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

test("the public view reads only the public summary and offers no owner controls", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/?public");
  await expect(page.locator(".calories-card .metric-value")).toContainText("500");
  await expect(page.getByText("Public read-only view — changes are disabled.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open owner view", exact: true })).toHaveAttribute("href", "/owner");

  for (const name of ["Open settings", "Add entry", "Add weight", "Edit Audit lunch", "Delete Audit lunch", "Duplicate Audit lunch", "Add Audit lunch to saved entries"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(page.locator(".saved-entries-panel")).toHaveCount(0);
  await expect(page.locator(".meals-panel")).toContainText("read only");
  expect(state.requests.map((request) => `${request.method} ${request.path}`)).toEqual(["GET /api/public/summary"]);
});

test("the owner view has no owner link and asks for the browser's timezone", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator(".calories-card .metric-value")).toContainText("500");
  await expect(page.getByRole("link", { name: "Open owner view" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
  const summary = state.requests.find((request) => request.path === "/api/dashboard/summary");
  expect(summary?.search).toBe("?timezone=UTC");
});

test("a failed load says so in each view's own words and never shows made-up data", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.failSummary = true;

  await page.goto("/?public");
  await expect(page.getByRole("heading", { name: "Public dashboard unavailable" })).toBeVisible();
  await expect(page.locator(".dashboard-state")).toContainText("The public dashboard could not be loaded. Try again later.");
  await expect(page.locator(".summary-grid")).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your dashboard is unavailable" })).toBeVisible();
  await expect(page.locator(".dashboard-state")).toContainText("Your saved log is unavailable. Try again later.");
  await expect(page.locator(".summary-grid")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add entry" })).toHaveCount(0);
});
