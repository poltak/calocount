import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test("insights are grouped in three columns at the dashboard bottom", async ({ page }) => {
  await page.setViewportSize({ width: 1398, height: 1000 });
  await page.emulateMedia({ colorScheme: "light" });
  await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Days worth repeating" })).toBeVisible();

  const layout = await page.evaluate(() => {
    const dashboard = document.querySelector<HTMLElement>(".content-grid");
    const insights = document.querySelector<HTMLElement>(".insights-overview");
    const content = document.querySelector<HTMLElement>("#insights-overview-content");
    if (!dashboard || !insights || !content) {
      throw new Error("Dashboard or insights layout is missing");
    }

    return {
      dashboardBottom: dashboard.getBoundingClientRect().bottom,
      insightsTop: insights.getBoundingClientRect().top,
      columnCount: getComputedStyle(content).gridTemplateColumns.trim().split(/\s+/).length,
      cards: Array.from(content.children).map((card) => {
        const bounds = card.getBoundingClientRect();
        return {
          title: card.querySelector("h2")?.textContent?.trim() ?? "",
          left: bounds.left,
          top: bounds.top,
        };
      }),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(layout.insightsTop).toBeGreaterThan(layout.dashboardBottom);
  expect(layout.columnCount).toBe(3);
  expect(layout.cards.map((card) => card.title)).toEqual([
    "Days worth repeating",
    "What changed this week?",
    "Frequency & amount",
  ]);
  expect(layout.cards[0].left).toBeLessThan(layout.cards[1].left);
  expect(layout.cards[1].left).toBeLessThan(layout.cards[2].left);
  const cardTops = layout.cards.map((card) => card.top);
  expect(Math.max(...cardTops) - Math.min(...cardTops)).toBeLessThanOrEqual(1);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
});
