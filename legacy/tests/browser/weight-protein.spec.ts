import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

test("adding a weight sends the day and kilograms and shows when it was saved", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator(".weight-reading")).toContainText("No weight recorded");
  await page.getByRole("button", { name: "Add weight", exact: true }).click();
  await page.getByLabel("Weight (kg)").fill("71.4");
  await page.getByRole("button", { name: "Save weight", exact: true }).click();

  await expect(page.locator(".weight-reading strong")).toHaveText("71.4 kg");
  await expect(page.locator(".weight-reading time")).toContainText("Saved at");
  await expect(page.getByRole("button", { name: "Edit weight", exact: true })).toBeVisible();
  const saves = state.requests.filter((request) => request.path === "/api/weights");
  expect(saves).toHaveLength(1);
  expect(saves[0].method).toBe("PUT");
  // The server stamps the saved time; the page sends only the day and the amount.
  expect(saves[0].body).toEqual({ logicalDate: "2026-09-12", weightKg: 71.4 });
});

test("a per-kilogram goal without any weight asks for a weight", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.settings.proteinGoalMode = "gramsPerKg";
  state.weights = [];
  await page.goto("/");
  const card = page.locator(".protein-card");
  await expect(card).toContainText("Goal unavailable");
  await expect(card).toContainText("Record a weight to calculate your daily protein goal.");
  await card.getByRole("link", { name: "Record weight", exact: true }).click();
  await expect(page.locator(".weight-form")).toBeVisible();

  await page.goto("/?public");
  await expect(page.locator(".protein-card")).toContainText("Record a weight in the owner dashboard.");
  await expect(page.locator(".protein-card").getByRole("link")).toHaveCount(0);
});

test("the weight trend plots recorded days and leaves the others as gaps", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.weights.push({ logicalDate: "2026-09-09", weightKg: 69, recordedAt: Date.parse("2026-09-09T07:00:00Z") });
  await page.goto("/");
  const columns = page.locator(".weight-point-column");
  await expect(columns).toHaveCount(7);
  await expect(page.locator('.weight-point-column[aria-label="Sep 9: 69 kilograms"]')).toHaveCount(1);
  await expect(page.locator('.weight-point-column[aria-label="Sep 11: 70 kilograms"]')).toHaveCount(1);
  await expect(page.locator('.weight-point-column[aria-label$="no weight recorded"]')).toHaveCount(5);
  await expect(page.locator(".weight-point")).toHaveCount(2);
  await expect(page.locator(".weight-average-path")).toHaveCount(1);

  state.weights = [];
  await page.reload();
  await expect(page.getByText("No weight records for the past 7 days")).toBeVisible();
  await expect(columns).toHaveCount(0);
});
