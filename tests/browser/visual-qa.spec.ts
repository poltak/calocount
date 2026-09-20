import { test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test("insights are grouped at the dashboard bottom", async ({ page }) => {
  await page.setViewportSize({ width: 1398, height: 1000 });
  await page.emulateMedia({ colorScheme: "light" });
  await mockDashboardApi(page);
  await page.goto("/");
  await page.screenshot({ path: "/tmp/calocount-bottom-insights.png", fullPage: true });
});
