import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

test("the owner view loads a private thumbnail and previews it in a dialog", async ({ page }) => {
  const state = await mockDashboardApi(page);
  Object.assign(state.meals[0], { photoKey: "meals/owner/dashboard/meal 1/photo", photoMimeType: "image/png", hasPhoto: true });
  await page.goto("/");

  const thumbnail = page.getByRole("button", { name: "View photo of Audit lunch", exact: true });
  await expect(thumbnail.locator("img")).toHaveAttribute("src", "/api/photos/meals/owner/dashboard/meal%201/photo");
  await expect(thumbnail.locator("img")).toHaveAttribute("loading", "lazy");
  await expect(page.locator(".meal-row")).not.toHaveClass(/without-photo/);

  const dialog = page.getByRole("dialog", { name: "Audit lunch" });
  await thumbnail.click();
  await expect(dialog.locator("img")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close photo preview" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(thumbnail).toBeFocused();

  await thumbnail.click();
  await page.locator(".photo-preview-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(dialog).toHaveCount(0);

  await thumbnail.click();
  await page.getByRole("button", { name: "Close photo preview" }).click();
  await expect(dialog).toHaveCount(0);
});

test("the public view loads photos by entry ID and never asks the private photo route", async ({ page }) => {
  const state = await mockDashboardApi(page);
  Object.assign(state.meals[0], { photoKey: "meals/owner/dashboard/meal-1/photo", photoMimeType: "image/png", hasPhoto: true });
  await page.goto("/?public");
  const thumbnail = page.getByRole("button", { name: "View photo of Audit lunch", exact: true });
  await expect(thumbnail.locator("img")).toHaveAttribute("src", "/meal-photos/meal-1");
  expect(state.requests.some((request) => request.path.startsWith("/api/photos/"))).toBe(false);
});

test("an entry without a photo, or whose photo fails to load, shows no thumbnail", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator(".meal-row")).toHaveClass(/without-photo/);
  await expect(page.locator(".meal-photo-button")).toHaveCount(0);

  state.failPhotos = true;
  Object.assign(state.meals[0], { photoKey: "meals/owner/dashboard/meal-1/photo", photoMimeType: "image/png", hasPhoto: true });
  await page.reload();
  await expect(page.locator(".calories-card .metric-value")).toContainText("500");
  await expect(page.locator(".meal-photo-button")).toHaveCount(0);
  await expect(page.locator(".meal-row")).toHaveClass(/without-photo/);
});
