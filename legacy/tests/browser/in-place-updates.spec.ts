import { expect, test, type Page } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

// The parts that the stylesheet fades in or raises when they first appear.
const ANIMATED = ".summary-card, .panel, .date-controls, .bar, .protein-target-fill, .macro-stack, .metric-ring-value";

type Seen = Element & { seen?: boolean };

/** Remember the nodes that are in the page now. */
async function markNodes(page: Page, selector = ANIMATED) {
  await page.evaluate((nodes) => {
    for (const node of document.querySelectorAll(nodes)) (node as Seen).seen = true;
  }, selector);
}

/** The nodes that were built after the mark. A new node plays its entry animation again. */
async function nodesBuiltSinceMark(page: Page, selector = ANIMATED) {
  return page.evaluate((nodes) => [...document.querySelectorAll(nodes)]
    .filter((node) => !(node as Seen).seen)
    .map((node) => node.getAttribute("class")), selector);
}

async function runningEntryAnimations(page: Page) {
  return page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.playState === "running" && "animationName" in animation).length);
}

/** Wait for the first load to end, then remember its nodes. */
async function settle(page: Page) {
  await expect(page.locator(".days-repeat")).toBeVisible();
  await expect.poll(() => runningEntryAnimations(page)).toBe(0);
  await markNodes(page);
}

test("a refresh when the window gets the focus changes the numbers in place", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.locator(".calories-card .metric-value")).toHaveText("500 / 2,400");
  await settle(page);

  // An entry changed on another device. The refresh must show it without building the cards again.
  state.meals[0].totalCalories = 650;
  state.meals[0].items[0].calories = 650;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".calories-card .metric-value")).toHaveText("650 / 2,400");
  await expect(page.locator('.bar-column[aria-label*="650 kilocalories"]')).toHaveCount(1);

  expect(await nodesBuiltSinceMark(page)).toEqual([]);
  expect(await runningEntryAnimations(page)).toBe(0);

  // A refresh with no change keeps every node too.
  const reads = state.summaryReads;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => state.summaryReads).toBeGreaterThan(reads);
  await expect(page.locator(".calories-card .metric-value")).toHaveText("650 / 2,400");
  expect(await nodesBuiltSinceMark(page)).toEqual([]);
  expect(await runningEntryAnimations(page)).toBe(0);
});

test("tracking a saved entry keeps the cards in place", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Add Audit lunch to saved entries", exact: true }).click();
  const row = page.locator(".saved-entry-row");
  await expect(row).toContainText("Audit lunch");
  await settle(page);

  const reads = state.summaryReads;
  await row.getByRole("button", { name: "Track now", exact: true }).click();
  await expect(page.locator(".calories-card .metric-value")).toHaveText("1,000 / 2,400");
  await expect(page.locator(".meal-row")).toHaveCount(2);
  // The summary loads again after the action. Wait for that render too.
  await expect.poll(() => state.summaryReads).toBeGreaterThan(reads);
  await expect(row.getByRole("button", { name: "Track now", exact: true })).toBeEnabled();

  expect(await nodesBuiltSinceMark(page)).toEqual([]);
  expect(await runningEntryAnimations(page)).toBe(0);
});

test("copying an entry to today keeps the cards in place", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.meals.push({
    ...structuredClone(state.meals[0]),
    id: "yesterday-soup",
    consumedAt: Date.parse("2026-09-11T12:00:00Z"),
    caption: "Yesterday soup",
    totalCalories: 300,
    items: [{ ...state.meals[0].items[0], name: "Yesterday soup", calories: 300 }],
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.locator("#today")).toContainText("September 11");
  await settle(page);

  const reads = state.summaryReads;
  await page.getByRole("button", { name: "Copy Yesterday soup to today", exact: true }).click();
  await expect(page.getByText("Copied “Yesterday soup” to today.", { exact: true })).toBeVisible();
  await expect(page.locator('.bar-column[aria-label*="800 kilocalories"]')).toHaveCount(1);
  await expect.poll(() => state.summaryReads).toBeGreaterThan(reads);
  await expect(page.getByRole("button", { name: "Copy Yesterday soup to today", exact: true })).toBeEnabled();

  expect(await nodesBuiltSinceMark(page)).toEqual([]);
  expect(await runningEntryAnimations(page)).toBe(0);
});

test("an open form keeps its node, its text and the caret during a refresh", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await settle(page);
  await markNodes(page, ".meal-row");

  // The form appears between the heading and the list. The list must stay as it is.
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  const name = page.locator(".add-meal-form").getByLabel("Entry name", { exact: true });
  await name.fill("Soup");
  await name.evaluate((input: HTMLInputElement) => input.setSelectionRange(2, 2));
  await markNodes(page, ".add-meal-form");
  expect(await nodesBuiltSinceMark(page, ".meal-row")).toEqual([]);

  state.meals[0].totalCalories = 650;
  state.meals[0].items[0].calories = 650;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".calories-card .metric-value")).toHaveText("650 / 2,400");

  await expect(name).toBeFocused();
  await expect(name).toHaveValue("Soup");
  expect(await name.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(2);
  expect(await nodesBuiltSinceMark(page, ".add-meal-form, .meal-row")).toEqual([]);

  // The list also stays when the form goes away.
  await page.getByRole("button", { name: "Close add entry form", exact: true }).click();
  await expect(page.locator(".add-meal-form")).toHaveCount(0);
  expect(await nodesBuiltSinceMark(page, ".meal-row")).toEqual([]);
  expect(await nodesBuiltSinceMark(page)).toEqual([]);
});

test("an open disclosure stays open when the data of its list changes", async ({ page }) => {
  const state = await mockDashboardApi(page);
  await page.goto("/");
  await settle(page);
  const sugars = page.locator(".nutrition-coverage-row", { hasText: "Total sugars" });
  await sugars.locator("summary").click();
  await expect(sugars).toHaveAttribute("open", "");
  await expect(sugars.locator("summary")).toContainText("No logged days in this window");

  // An entry for yesterday arrives. The fibre row leaves the list, and the text of the sugars row changes.
  state.meals.push({ ...structuredClone(state.meals[0]), id: "yesterday", consumedAt: Date.parse("2026-09-11T12:00:00Z") });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".nutrition-attention__coverage-line")).toContainText("1 of 14 days have logs");

  await expect(page.locator(".nutrition-coverage-row", { hasText: "Fiber" })).toHaveCount(0);
  await expect(sugars.locator("summary")).toContainText("1 logged day");
  await expect(sugars).toHaveAttribute("open", "");
});
