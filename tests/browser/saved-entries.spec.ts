import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

test("an entry can be saved, tracked again today, and removed", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  const panel = page.locator(".saved-entries-panel");
  await expect(panel.getByText("No saved entries yet")).toBeVisible();

  const readsBeforeSave = state.summaryReads;
  await page.getByRole("button", { name: "Add Audit lunch to saved entries", exact: true }).click();
  const row = panel.locator(".saved-entry-row");
  await expect(row).toContainText("Audit lunch");
  await expect(row).toContainText("500 kcal · 30g protein");
  await expect(panel.getByRole("heading", { name: "Saved entries 1" })).toBeVisible();
  const saveButton = page.getByRole("button", { name: "Add Audit lunch to saved entries", exact: true });
  await expect(saveButton).toHaveText("Saved");
  await expect(saveButton).toBeDisabled();
  expect(state.requests.find((request) => request.method === "POST" && request.path === "/api/saved-entries")?.body)
    .toEqual({ sourceEntryId: "meal-1" });
  // Saving an entry does not change the day's numbers, so the summary is not reloaded.
  expect(state.summaryReads).toBe(readsBeforeSave);

  await row.getByRole("button", { name: "Track now", exact: true }).click();
  await expect(page.locator(".calories-card .metric-value")).toHaveText("1,000 / 2,400");
  await expect(page.locator(".meal-row")).toHaveCount(2);
  const track = state.requests.find((request) => request.path.endsWith("/track"));
  expect(track?.method).toBe("POST");
  expect(typeof track?.body?.consumedAt).toBe("number");

  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(panel.getByText("No saved entries yet")).toBeVisible();
  expect(state.requests.some((request) => request.method === "DELETE" && request.path.startsWith("/api/saved-entries/"))).toBe(true);
  // Removing the saved entry keeps the meals that were tracked from it.
  await expect(page.locator(".meal-row")).toHaveCount(2);
});

test("the dashboard still loads when saved entries cannot be loaded", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.failSavedEntries = true;
  await page.goto("/");
  await expect(page.locator(".calories-card .metric-value")).toHaveText("500 / 2,400");
  await expect(page.locator(".saved-entries-panel").getByText("No saved entries yet")).toBeVisible();
});
