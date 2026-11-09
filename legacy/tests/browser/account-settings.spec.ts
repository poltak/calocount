import { expect, test, type Page } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

type Recorded = { method: string; path: string };

async function mockAccountApi(page: Page, mode: "passkey" | "access") {
  const requests: Recorded[] = [];
  const passkeys = [
    { id: "phone", name: "iPhone", createdAt: Date.parse("2026-09-01T00:00:00Z"), lastUsedAt: Date.parse("2026-09-12T08:00:00Z"), synced: true, current: true },
    { id: "laptop", name: "Mac", createdAt: Date.parse("2026-09-05T00:00:00Z"), lastUsedAt: null, synced: false, current: false },
  ];
  let connections = [{ id: "grant-1", name: "ChatGPT", createdAt: Date.parse("2026-09-10T00:00:00Z"), lastUsedAt: Date.parse("2026-09-12T09:00:00Z") }];
  await page.route("**/api/auth/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ method: request.method(), path });
    if (path === "/api/auth/status") return route.fulfill({ json: mode === "passkey" ? { mode, signedIn: true, hasPasskeys: true, setupCode: "ready" } : { mode } });
    if (path === "/api/auth/passkeys") return route.fulfill({ json: { passkeys } });
    if (path === "/api/auth/passkeys/laptop" && request.method() === "DELETE") {
      passkeys.splice(1, 1);
      return route.fulfill({ json: { removed: true, signedOut: false } });
    }
    if (path === "/api/auth/connections") return route.fulfill({ json: { connections } });
    if (path === "/api/auth/connections/grant-1" && request.method() === "DELETE") {
      connections = [];
      return route.fulfill({ json: { removed: true } });
    }
    if (path === "/api/auth/logout") return route.fulfill({ json: { signedIn: false } });
    return route.fulfill({ status: 404, json: {} });
  });
  return requests;
}

test("the settings list the passkeys and connected apps, and remove them", async ({ page }) => {
  await mockDashboardApi(page);
  const requests = await mockAccountApi(page, "passkey");
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  const section = page.locator(".account-settings");
  await expect(section.getByText("iPhone")).toBeVisible();
  await expect(section.getByText("This device", { exact: true })).toBeVisible();
  await expect(section.getByText("Last used never")).toBeVisible();
  await expect(section.getByText("ChatGPT", { exact: true })).toBeVisible();

  await section.getByRole("button", { name: "Remove passkey Mac" }).click();
  await expect(section.getByText("Passkey removed.")).toBeVisible();
  await expect(section.getByText("Mac", { exact: true })).toHaveCount(0);
  // The last passkey stays, so the owner keeps a way in.
  await expect(section.getByRole("button", { name: "Remove passkey iPhone" })).toBeDisabled();

  await section.getByRole("button", { name: "Disconnect ChatGPT" }).click();
  await expect(section.getByText("ChatGPT disconnected.")).toBeVisible();
  await expect(section.getByText("No apps are connected.", { exact: false })).toBeVisible();
  expect(requests.filter((request) => request.method === "DELETE").map((request) => request.path)).toEqual([
    "/api/auth/passkeys/laptop",
    "/api/auth/connections/grant-1",
  ]);

  await section.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/owner");
  expect(requests.some((request) => request.method === "POST" && request.path === "/api/auth/logout")).toBe(true);
});

test("an Access instance shows no passkey settings", async ({ page }) => {
  await mockDashboardApi(page);
  const requests = await mockAccountApi(page, "access");
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("dialog", { name: "Daily targets" })).toBeVisible();
  await expect(page.locator(".account-settings")).toBeHidden();
  expect(requests.map((request) => request.path)).toEqual(["/api/auth/status"]);
});
