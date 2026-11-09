import { expect, test, type Page } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
});

type MockState = Awaited<ReturnType<typeof mockDashboardApi>>;

/** Add an entry on a day before the seven recent days. */
function addOlderMeal(state: MockState, { id, eatenAt, name, calories, proteinG }: {
  id: string; eatenAt: string; name: string; calories: number; proteinG: number;
}) {
  state.meals.push({
    ...structuredClone(state.meals[0]), id, consumedAt: Date.parse(eatenAt), caption: name, mealType: "dinner",
    totalCalories: calories, totalProteinG: proteinG, totalCarbsG: 60, totalFatG: 20,
    items: [{ name, quantity: 1, unit: "serving", calories, proteinG, carbsG: 60, fatG: 20, fiberG: null, caffeineMg: null }],
  });
}

async function openCalendar(page: Page) {
  await page.getByRole("button", { name: "Open calendar", exact: true }).click();
  return page.getByRole("region", { name: "Calendar of past days" });
}

test("the calendar shows the calories and protein of each day and opens an older day", async ({ page }) => {
  const state = await mockDashboardApi(page);
  addOlderMeal(state, { id: "meal-august", eatenAt: "2026-08-20T19:00:00Z", name: "August dinner", calories: 700, proteinG: 45 });
  addOlderMeal(state, { id: "meal-august-2", eatenAt: "2026-08-20T08:00:00Z", name: "August breakfast", calories: 350.4, proteinG: 20 });
  addOlderMeal(state, { id: "meal-july", eatenAt: "2026-07-04T19:00:00Z", name: "July dinner", calories: 900, proteinG: 50 });
  await page.goto("/");

  const calendar = await openCalendar(page);
  await expect(calendar.getByRole("heading", { name: "September 2026" })).toBeVisible();
  const today = calendar.getByRole("button", { name: "Saturday, September 12, 2026: 500 kilocalories, 30 grams of protein" });
  await expect(today).toHaveAttribute("aria-pressed", "true");
  await expect(today.locator(".calendar-day-calories")).toHaveText("500");
  await expect(today.locator(".calendar-day-protein")).toHaveText("30g");
  await expect(calendar.getByRole("button", { name: "Friday, September 11, 2026: no entries" })).toBeEnabled();
  await expect(calendar.getByRole("button", { name: "Sunday, September 13, 2026: no entries" })).toBeDisabled();
  await expect(calendar.getByRole("button", { name: "Next month" })).toBeDisabled();

  await calendar.getByRole("button", { name: "Previous month" }).click();
  await expect(calendar.getByRole("heading", { name: "August 2026" })).toBeVisible();
  const august = calendar.getByRole("button", { name: "Thursday, August 20, 2026: 1,050 kilocalories, 65 grams of protein" });
  await expect(august.locator(".calendar-day-calories")).toHaveText("1,050");
  await expect(august.locator(".calendar-day-protein")).toHaveText("65g");
  // The log starts in July, so the calendar stops there.
  await calendar.getByRole("button", { name: "Previous month" }).click();
  await expect(calendar.getByRole("heading", { name: "July 2026" })).toBeVisible();
  await expect(calendar.getByRole("button", { name: "Previous month" })).toBeDisabled();
  await calendar.getByRole("button", { name: "Next month" }).click();

  await august.click();
  await expect(calendar).toHaveCount(0);
  await expect(page.locator("#today")).toHaveText("Thursday, August 20, 2026");
  await expect(page.locator(".today-chip")).toHaveCount(0);
  await expect(page.locator(".date-pill.active")).toHaveCount(0);
  await expect(page.locator(".calories-card .metric-value")).toContainText("1,050");
  await expect(page.locator(".protein-card .metric-value")).toContainText("65g");
  await expect(page.locator(".meal-row")).toHaveCount(2);
  await expect(page.locator(".meal-row", { hasText: "August dinner" }).locator("time")).toHaveText("19:00");
  const dayReads = state.requests.filter((request) => request.path === "/api/days/2026-08-20");
  expect(dayReads).toHaveLength(1);
  expect(dayReads[0].search).toBe("?timezone=UTC");

  // The calendar opens again on the month of the day in view.
  const reopened = await openCalendar(page);
  await expect(reopened.getByRole("heading", { name: "August 2026" })).toBeVisible();
  await expect(reopened.getByRole("button", { name: /^Thursday, August 20, 2026/ })).toHaveAttribute("aria-pressed", "true");
  await reopened.getByRole("button", { name: "Close calendar" }).click();
  await expect(reopened).toHaveCount(0);
});

test("the day arrows go from the recent days to older days and back", async ({ page }) => {
  const state = await mockDashboardApi(page);
  addOlderMeal(state, { id: "meal-older", eatenAt: "2026-09-05T19:00:00Z", name: "Older dinner", calories: 640, proteinG: 41 });
  await page.goto("/");
  const previous = page.getByRole("button", { name: "Previous day", exact: true });
  const next = page.getByRole("button", { name: "Next day", exact: true });
  await expect(next).toBeDisabled();
  for (let step = 0; step < 6; step++) await previous.click();
  await expect(page.locator("#today")).toHaveText("Sunday, September 6, 2026");
  expect(state.requests.filter((request) => request.path.startsWith("/api/days"))).toHaveLength(0);

  await previous.click();
  await expect(page.locator("#today")).toHaveText("Saturday, September 5, 2026");
  await expect(page.locator(".meal-row", { hasText: "Older dinner" })).toHaveCount(1);
  await expect(page.locator(".meal-total")).toContainText("640");
  await previous.click();
  await expect(page.locator("#today")).toHaveText("Friday, September 4, 2026");
  await expect(page.locator(".empty-meals")).toContainText("No entries logged for Friday");

  await next.click();
  await next.click();
  await expect(page.locator("#today")).toHaveText("Sunday, September 6, 2026");
  await expect(page.locator(".date-pill.active")).toHaveAccessibleName("Sunday, September 6, 2026");
});

test("an entry on an older day can be changed, and a new entry can be added to that day", async ({ page }) => {
  const state = await mockDashboardApi(page);
  addOlderMeal(state, { id: "meal-august", eatenAt: "2026-08-20T19:00:00Z", name: "August dinner", calories: 700, proteinG: 45 });
  await page.goto("/");
  const calendar = await openCalendar(page);
  await calendar.getByRole("button", { name: "Previous month" }).click();
  await calendar.getByRole("button", { name: /^Thursday, August 20, 2026/ }).click();
  await expect(page.locator(".meal-row", { hasText: "August dinner" })).toHaveCount(1);

  await page.getByRole("button", { name: "Edit August dinner", exact: true }).click();
  await page.locator(".inline-editor").getByLabel("Name", { exact: true }).fill("August supper");
  await page.locator(".inline-editor").getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".meal-row", { hasText: "August supper" })).toHaveCount(1);
  expect(state.requests.filter((request) => request.method === "PATCH").map((request) => request.path)).toEqual(["/api/meals/meal-august"]);
  // The summary loads again after a save. The older day stays in view.
  await expect(page.locator("#today")).toHaveText("Thursday, August 20, 2026");

  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  const form = page.locator(".add-meal-form");
  await form.getByLabel("Entry time").fill("08:15");
  await form.getByLabel("Entry name", { exact: true }).fill("Late addition");
  await form.getByLabel("Calories", { exact: true }).fill("300");
  await form.getByLabel("Protein (g)", { exact: true }).fill("20");
  await form.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.locator(".meal-row")).toHaveCount(2);
  await expect(page.locator(".calories-card .metric-value")).toContainText("1,000");
  const create = state.requests.find((request) => request.method === "POST" && request.path === "/api/meals");
  expect(create?.body?.consumedAt).toBe(Date.parse("2026-08-20T08:15:00Z"));

  const reopened = await openCalendar(page);
  await expect(reopened.getByRole("button", { name: "Thursday, August 20, 2026: 1,000 kilocalories, 65 grams of protein" })).toBeVisible();
});

test("a day or a month that does not load reports the failure and can be tried again", async ({ page }) => {
  const state = await mockDashboardApi(page);
  addOlderMeal(state, { id: "meal-august", eatenAt: "2026-08-20T19:00:00Z", name: "August dinner", calories: 700, proteinG: 45 });
  await page.goto("/");
  state.failDays = true;
  const calendar = await openCalendar(page);
  await expect(calendar.getByRole("alert")).toContainText("September 2026 could not be loaded.");
  state.failDays = false;
  await calendar.getByRole("button", { name: "Try again" }).click();
  await expect(calendar.getByRole("alert")).toHaveCount(0);
  await expect(calendar.locator(".calendar-day.has-entries")).toHaveCount(1);

  await calendar.getByRole("button", { name: "Previous month" }).click();
  await expect(calendar.locator(".calendar-day.has-entries")).toHaveCount(1);
  state.failDays = true;
  await calendar.getByRole("button", { name: /^Thursday, August 20, 2026/ }).click();
  await expect(page.locator(".action-feedback.error")).toHaveText("Test day failed.");
  await expect(page.locator("#today")).toHaveText("Saturday, September 12, 2026");
  await expect(page.locator(".meal-row", { hasText: "Audit lunch" })).toHaveCount(1);
});

test("the public view has the calendar and opens older days from the public summary path", async ({ page }) => {
  const state = await mockDashboardApi(page);
  addOlderMeal(state, { id: "meal-august", eatenAt: "2026-08-20T19:00:00Z", name: "August dinner", calories: 700, proteinG: 45 });
  await page.goto("/?public");
  await expect(page.locator(".calories-card .metric-value")).toContainText("500");

  const calendar = await openCalendar(page);
  await expect(calendar.getByRole("button", { name: "Saturday, September 12, 2026: 500 kilocalories, 30 grams of protein" })).toBeVisible();
  await calendar.getByRole("button", { name: "Previous month" }).click();
  await calendar.getByRole("button", { name: "Thursday, August 20, 2026: 700 kilocalories, 45 grams of protein" }).click();
  await expect(page.locator("#today")).toHaveText("Thursday, August 20, 2026");
  await expect(page.locator(".calories-card .metric-value")).toContainText("700");
  await expect(page.locator(".meal-row", { hasText: "August dinner" })).toHaveCount(1);
  // An older day stays read-only.
  for (const name of ["Add entry", "Add weight", "Edit August dinner", "Delete August dinner", "Duplicate August dinner"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }

  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.locator("#today")).toHaveText("Wednesday, August 19, 2026");
  await expect(page.locator(".empty-meals")).toContainText("No entries were logged for this day.");

  // The public view never asks an owner route.
  expect(state.requests.map((request) => `${request.method} ${request.path}${request.search}`)).toEqual([
    "GET /api/public/summary",
    "GET /api/public/summary?view=month&month=2026-09",
    "GET /api/public/summary?view=month&month=2026-08",
    "GET /api/public/summary?view=day&date=2026-08-20",
    "GET /api/public/summary?view=day&date=2026-08-19",
  ]);
  expect(state.writes).toBe(0);
});

test("the public view counts calendar days in the owner's saved timezone", async ({ page }) => {
  const state = await mockDashboardApi(page);
  state.settings.timezone = "Asia/Ho_Chi_Minh";
  // 19:00 UTC on 20 August is 02:00 on 21 August in Ho Chi Minh City.
  addOlderMeal(state, { id: "meal-august", eatenAt: "2026-08-20T19:00:00Z", name: "August dinner", calories: 700, proteinG: 45 });
  await page.goto("/?public");
  const calendar = await openCalendar(page);
  await calendar.getByRole("button", { name: "Previous month" }).click();
  await calendar.getByRole("button", { name: "Friday, August 21, 2026: 700 kilocalories, 45 grams of protein" }).click();
  await expect(page.locator("#today")).toHaveText("Friday, August 21, 2026");
  await expect(page.locator(".meal-row", { hasText: "August dinner" }).locator("time")).toHaveText("02:00");
});
