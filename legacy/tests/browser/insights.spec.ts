import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

async function seedInsights(page: Page) {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
  const state = await mockDashboardApi(page);
  const template = structuredClone(state.meals[0]);
  for (let offset = 1; offset <= 14; offset++) {
    const currentWeek = offset <= 7;
    const date = new Date(Date.parse(state.date) - offset * 86_400_000).toISOString().slice(0, 10);
    for (const drink of [false, true]) {
      const meal = structuredClone(template);
      meal.id = `${drink ? "coffee" : "food"}-${offset}`;
      meal.consumedAt = Date.parse(`${date}T${drink ? "08" : "12"}:00:00Z`);
      meal.caption = drink ? "Coffee with milk" : "Rice and chicken";
      meal.items[0].name = meal.caption;
      meal.totalCalories = meal.items[0].calories = drink ? currentWeek ? 150 : 100 : offset === 14 ? 4200 : 2100;
      meal.totalProteinG = meal.items[0].proteinG = drink ? 5 : offset === 1 ? 175 : 150;
      meal.items[0].fiberG = drink ? null : 32;
      meal.items[0].caffeineMg = drink ? currentWeek ? 120 : 80 : null;
      state.meals.push(meal);
    }
  }
  return state;
}

async function expectFrequencyLayout(frequency: Locator, viewportWidth: number) {
  const metrics = await frequency.evaluate((section) => {
    const visual = section.querySelector<HTMLElement>(".frequency-portion__visual");
    const svg = section.querySelector<SVGSVGElement>("svg");
    const tick = svg?.querySelector<SVGTextElement>(".frequency-portion__tick text");
    const verticalAxisLabel = svg?.querySelector<SVGTextElement>(".frequency-portion__axis-label[transform]");
    if (!visual || !svg || !tick || !verticalAxisLabel) {
      throw new Error("Frequency chart is missing its visual, SVG, or axis labels");
    }

    const visualBounds = visual.getBoundingClientRect();
    const visibleLeft = visualBounds.left + visual.clientLeft;
    const visibleRight = visibleLeft + visual.clientWidth;
    const points = Array.from(svg.querySelectorAll<SVGGElement>(".frequency-portion__point"));
    const visiblePoints = points.filter((point) => {
      const bounds = point.getBoundingClientRect();
      return bounds.left >= visibleLeft - 1 && bounds.right <= visibleRight + 1;
    }).length;
    const axisBounds = verticalAxisLabel.getBoundingClientRect();
    const overlappingYAxisLabels = Array.from(svg.querySelectorAll<SVGTextElement>(".frequency-portion__tick--y text"))
      .filter((label) => {
        const bounds = label.getBoundingClientRect();
        return bounds.left < axisBounds.right && bounds.right > axisBounds.left;
      }).length;
    const scale = svg.getScreenCTM()?.a ?? svg.getBoundingClientRect().width / 720;

    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      renderedTickFontSize: Number.parseFloat(getComputedStyle(tick).fontSize) * scale,
      overlappingYAxisLabels,
      visiblePoints,
      pointCount: points.length,
      visualWidth: visual.clientWidth,
      visualScrollWidth: visual.scrollWidth,
    };
  });

  expect(metrics.viewportWidth).toBe(viewportWidth);
  expect(metrics.renderedTickFontSize, `Axis labels are too small at ${viewportWidth}px: ${JSON.stringify(metrics)}`)
    .toBeGreaterThanOrEqual(9);
  expect(metrics.overlappingYAxisLabels, `Y-axis values overlap the axis title at ${viewportWidth}px: ${JSON.stringify(metrics)}`)
    .toBe(0);
  expect(metrics.visualScrollWidth, `Frequency chart needs horizontal scrolling at ${viewportWidth}px: ${JSON.stringify(metrics)}`)
    .toBeLessThanOrEqual(metrics.visualWidth + 1);
  expect(metrics.visiblePoints, `Some frequency points are outside the initial view at ${viewportWidth}px: ${JSON.stringify(metrics)}`)
    .toBe(metrics.pointCount);
  expect(metrics.documentWidth, `The page overflows at ${viewportWidth}px: ${JSON.stringify(metrics)}`)
    .toBeLessThanOrEqual(viewportWidth + 1);
}

async function expectPanelFitsViewport(panel: Locator) {
  const metrics = await panel.evaluate((element) => {
    const section = element as HTMLElement;
    const bounds = section.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: section.clientWidth,
      scrollWidth: section.scrollWidth,
    };
  });

  expect(metrics.left, `Panel starts outside the viewport: ${JSON.stringify(metrics)}`).toBeGreaterThanOrEqual(-1);
  expect(metrics.right, `Panel ends outside the viewport: ${JSON.stringify(metrics)}`)
    .toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.scrollWidth, `Panel content overflows horizontally: ${JSON.stringify(metrics)}`)
    .toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.documentWidth, `The page overflows horizontally: ${JSON.stringify(metrics)}`)
    .toBeLessThanOrEqual(metrics.viewportWidth + 1);
}

async function expectWeeklyCardsFitPanel(weekly: Locator) {
  const metrics = await weekly.evaluate((element) => {
    const section = element as HTMLElement;
    const panelBounds = section.getBoundingClientRect();
    const cards = Array.from(section.querySelectorAll<HTMLElement>(".weekly-metric")).map((card) => {
      const bounds = card.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        clientWidth: card.clientWidth,
        scrollWidth: card.scrollWidth,
        clientHeight: card.clientHeight,
        scrollHeight: card.scrollHeight,
      };
    });
    const overlappingCards: number[][] = [];

    for (let first = 0; first < cards.length; first++) {
      for (let second = first + 1; second < cards.length; second++) {
        const a = cards[first];
        const b = cards[second];
        if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) {
          overlappingCards.push([first, second]);
        }
      }
    }

    return {
      panel: {
        left: panelBounds.left,
        right: panelBounds.right,
        top: panelBounds.top,
        bottom: panelBounds.bottom,
      },
      cards,
      overlappingCards,
    };
  });

  expect(metrics.cards, `Expected all weekly metric cards: ${JSON.stringify(metrics)}`).toHaveLength(5);
  for (const [index, card] of metrics.cards.entries()) {
    expect(card.left, `Weekly metric ${index + 1} extends left of its panel: ${JSON.stringify(metrics)}`)
      .toBeGreaterThanOrEqual(metrics.panel.left - 1);
    expect(card.right, `Weekly metric ${index + 1} extends right of its panel: ${JSON.stringify(metrics)}`)
      .toBeLessThanOrEqual(metrics.panel.right + 1);
    expect(card.top, `Weekly metric ${index + 1} extends above its panel: ${JSON.stringify(metrics)}`)
      .toBeGreaterThanOrEqual(metrics.panel.top - 1);
    expect(card.bottom, `Weekly metric ${index + 1} extends below its panel: ${JSON.stringify(metrics)}`)
      .toBeLessThanOrEqual(metrics.panel.bottom + 1);
    expect(card.scrollWidth, `Weekly metric ${index + 1} has clipped horizontal content: ${JSON.stringify(metrics)}`)
      .toBeLessThanOrEqual(card.clientWidth + 1);
    expect(card.scrollHeight, `Weekly metric ${index + 1} has clipped vertical content: ${JSON.stringify(metrics)}`)
      .toBeLessThanOrEqual(card.clientHeight + 1);
  }
  expect(metrics.overlappingCards, `Weekly metric cards overlap: ${JSON.stringify(metrics)}`).toEqual([]);
}

test("insights inspect historical food and drink logs, scale outliers, and explain nutrient changes", async ({ page }) => {
  const state = await seedInsights(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?public");
  const repeat = page.getByRole("region", { name: "Days worth repeating" });
  await expect(repeat.locator(".repeat-point")).toHaveCount(14);
  await expect(repeat.locator(".repeat-point.joint")).toHaveCount(1);
  await repeat.getByLabel("Inspect a day").selectOption("2026-08-29");
  await expect(repeat.locator(".repeat-details")).toContainText("Coffee with milk");
  await expect(repeat.locator(".repeat-details")).toContainText("179% of the current calorie target");
  const outlier = repeat.getByRole("button", { name: /August 29|Aug 29/ });
  const xPosition = await outlier.evaluate((element: HTMLElement) => Number.parseFloat(element.style.left));
  expect(xPosition).toBeGreaterThan(70);
  expect(xPosition).toBeLessThan(100);
  await repeat.getByLabel("Vertical axis").selectOption("fiber");
  await expect(repeat.locator(".days-repeat-summary")).toContainText("partial fiber coverage");
  await expect(repeat.locator(".repeat-chart")).toBeVisible();
  await expect(repeat.locator(".repeat-details")).toBeVisible();
  await expectPanelFitsViewport(repeat);

  const weekly = page.getByRole("region", { name: "What changed this week?" });
  await expect(weekly).toContainText("7/7 recorded days");
  await weekly.getByRole("button", { name: /^Caffeine/ }).click();
  await expect(weekly.locator(".weekly-breakdown")).toContainText("caffeine");
  await weekly.locator(".weekly-contribution-list").getByRole("button", { name: /Coffee with milk/ }).click();
  await expect(weekly.locator(".weekly-source-detail")).toContainText("Coffee with milk");
  await expect(weekly.locator(".weekly-source-detail")).not.toContainText("entry coffee-");
  await expectPanelFitsViewport(weekly);
  await expectWeeklyCardsFitPanel(weekly);

  const frequency = page.getByRole("region", { name: "Frequency & amount" });
  await frequency.getByRole("button", { name: "7 days", exact: true }).click();
  await frequency.getByRole("combobox", { name: /Amount/ }).selectOption("caffeineMg");
  await frequency.locator(".frequency-portion__food-list").getByRole("button", { name: /Coffee with milk/ }).click();
  await expect(frequency.locator(".frequency-portion__details")).toContainText("840 mg");
  await expect(frequency.locator(".frequency-portion__details")).toContainText("120 mg");
  for (const width of [1280, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await expectFrequencyLayout(frequency, width);
    await expectPanelFitsViewport(frequency);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const insightsToggle = page.getByRole("button", { name: "Hide insights" });
  await insightsToggle.click();
  await expect(repeat).toBeHidden();
  await expect(page.getByRole("button", { name: "Show insights" })).toBeVisible();
  await page.getByRole("button", { name: "Show insights" }).click();
  await expect(repeat).toBeVisible();
  expect(state.writes).toBe(0);
});

test("new charts work on mobile in dark mode and refresh after a food log is deleted", async ({ page }) => {
  const state = await seedInsights(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const repeat = page.getByRole("region", { name: "Days worth repeating" });
  await repeat.getByLabel("Inspect a day").selectOption("2026-09-11");
  await expect(repeat.locator(".repeat-details li")).toHaveCount(2);
  await expect(repeat.locator(".repeat-chart")).toBeVisible();
  await expect(repeat.locator(".repeat-details")).toBeVisible();
  await expectPanelFitsViewport(repeat);
  const weekly = page.getByRole("region", { name: "What changed this week?" });
  await expectPanelFitsViewport(weekly);
  await expectWeeklyCardsFitPanel(weekly);
  const frequency = page.getByRole("region", { name: "Frequency & amount" });
  await expectFrequencyLayout(frequency, 390);
  await expectPanelFitsViewport(frequency);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);

  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Coffee with milk", exact: true }).click();
  await expect.poll(() => state.meals.some((entry) => entry.id === "coffee-1")).toBe(false);
  await expect(repeat.locator(".repeat-details li")).toHaveCount(1);
  await expect(repeat.locator(".repeat-details")).not.toContainText("Coffee with milk");
});
