import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

test("settings keep primary goals apart from nutrition goals and save a custom goal", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Daily targets" });
  await expect(dialog.getByText("Primary goals")).toBeVisible();
  await expect(dialog.getByLabel("Calories", { exact: true })).toHaveValue("2400");

  const fiber = dialog.getByLabel("Fiber daily goal");
  await expect(fiber).toBeHidden();
  await dialog.locator("summary", { hasText: "Nutrition goals" }).click();
  await expect(fiber).toHaveValue("28");
  await expect(dialog.getByText("Blank a field to turn that goal off.")).toBeVisible();

  await fiber.fill("35");
  await dialog.getByLabel("Sodium daily goal").fill("");
  await dialog.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const save = state.requests.find((request) => request.method === "PATCH" && request.path === "/api/settings");
  // Only the changed goals are sent: a custom amount, and null for a goal that was turned off.
  expect(save?.body?.nutrientTargets).toEqual({ fiberG: 35, sodiumMg: null });
  expect(save?.body).toMatchObject({ dailyCalorieTarget: 2400, proteinGoalMode: "grams" });
});

test("restoring the recommended defaults resets every nutrition goal field", async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Daily targets" });
  await dialog.locator("summary", { hasText: "Nutrition goals" }).click();
  await dialog.getByLabel("Fiber daily goal").fill("35");
  await dialog.getByLabel("Sodium daily goal").fill("");
  await dialog.getByRole("button", { name: "Restore recommended defaults" }).click();
  await expect(dialog.getByLabel("Fiber daily goal")).toHaveValue("28");
  await expect(dialog.getByLabel("Sodium daily goal")).toHaveValue("2300");
});

test("an invalid nutrition goal is refused before any request", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Daily targets" });
  await dialog.locator("summary", { hasText: "Nutrition goals" }).click();
  const fiber = dialog.getByLabel("Fiber daily goal");
  await fiber.fill("-3");
  // The field's own minimum blocks the browser from submitting the form.
  await dialog.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(state.requests.some((request) => request.method === "PATCH")).toBe(false);
});

test("the saved timezone is shown and kept when this device is in the same one", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Daily targets" });
  await expect(dialog.getByRole("combobox", { name: "Timezone" })).toHaveValue("UTC");
  await expect(dialog.getByRole("button", { name: /Use this device's timezone/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.requests.find((request) => request.method === "PATCH" && request.path === "/api/settings")?.body?.timezone).toBe("UTC");
});

test.describe("on a device in another timezone", () => {
  test.use({ timezoneId: "Europe/Berlin" });

  test("the owner can switch the saved timezone to this device's", async ({ page }) => {
    const state = await mockDashboardApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Open settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Daily targets" });
    const timezone = dialog.getByRole("combobox", { name: "Timezone" });
    await expect(timezone).toHaveValue("UTC");
    await dialog.getByRole("button", { name: "Use this device's timezone (Europe/Berlin)" }).click();
    await expect(timezone).toHaveValue("Europe/Berlin");
    await dialog.getByRole("button", { name: "Save targets", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.settings.timezone).toBe("Europe/Berlin");
  });
});
