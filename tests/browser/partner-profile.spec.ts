import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

test("the owner turns the partner profile on in settings, and the switcher appears", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  const switcher = page.getByRole("navigation", { name: "Profile" });
  await expect(page.getByText("Audit lunch").first()).toBeVisible();
  await expect(switcher).toHaveCount(0);

  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Daily targets" });
  await expect(dialog.getByText("Public dashboard", { exact: true })).toBeVisible();
  await dialog.getByLabel("Keep a second log for a partner").check();
  await dialog.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const save = state.requests.find((request) => request.method === "PATCH" && request.path === "/api/settings");
  expect(save?.body).toMatchObject({ partnerProfileEnabled: true });
  expect(save?.search).toBe("");
  await expect(switcher.getByRole("link", { name: "Owner" })).toHaveAttribute("aria-current", "page");
  await expect(switcher.getByRole("link", { name: "Partner" })).toHaveAttribute("href", "/owner/partner");
});

test("the partner page sends the partner profile with each data request and hides owner-only settings", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.settings.partnerProfileEnabled = true;
  await page.goto("/?partner");
  const switcher = page.getByRole("navigation", { name: "Profile" });
  await expect(switcher.getByRole("link", { name: "Partner" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Daily targets" });
  await expect(dialog.getByLabel("Calories", { exact: true })).toHaveValue("2400");
  await expect(dialog.getByText("Public dashboard", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("Keep a second log for a partner")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const dataRequests = state.requests.filter((request) => !request.path.startsWith("/api/auth/"));
  expect(dataRequests.length).toBeGreaterThan(0);
  for (const request of dataRequests) expect(new URLSearchParams(request.search).get("profile"), `${request.method} ${request.path}`).toBe("partner");
  const save = state.requests.find((request) => request.method === "PATCH" && request.path === "/api/settings");
  expect(save?.body).not.toHaveProperty("publicViewEnabled");
  expect(save?.body).not.toHaveProperty("partnerProfileEnabled");
});
