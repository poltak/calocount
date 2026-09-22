import { expect, test } from "@playwright/test";
import { mockDashboardApi } from "./mock-api";

test("food scenarios show reference context, generated tradeoffs, and source entry detail", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
  const state = await mockDashboardApi(page);
  for (const [offset, sourceName, sourceCalcium, replacementName, replacementCalcium] of [
    [1, "Yogurt", 240, "Fruit", 40],
    [2, "Yogurt", 240, "Fruit", 40],
    [3, "Bread", 100, "Oats", 140],
  ] as const) {
    const date = new Date(Date.parse(state.date) - offset * 86_400_000).toISOString().slice(0, 10);
    const meal = structuredClone(state.meals[0]);
    meal.id = `scenario-${offset}`;
    meal.consumedAt = Date.parse(`${date}T12:00:00Z`);
    meal.caption = sourceName;
    const sourceItem = { ...meal.items[0], name: sourceName, fiberG: 4 };
    const replacementItem = { ...meal.items[0], name: replacementName, fiberG: 2 };
    Object.assign(sourceItem, { calciumMg: sourceCalcium });
    Object.assign(replacementItem, { calciumMg: replacementCalcium });
    meal.items = [
      sourceItem,
      replacementItem,
    ];
    state.meals.push(meal);
  }

  await page.goto("/?public");
  const food = page.getByRole("region", { name: "Nutrition food insights" });
  await expect(food).toContainText("Tradeoff:");
  await expect(food).toContainText("of minimum");

  await food.getByRole("combobox", { name: "Nutrient", exact: true }).selectOption("calciumMg");
  await expect(food).toContainText("Top three");
  await expect(food).toContainText("Yogurt");
  await food.getByRole("button", { name: "Exclude" }).first().click();
  await expect(food).toContainText("Matching entries");
  await expect(food).toContainText("Yogurt");
  await expect(food).toContainText("portion");
  expect(state.writes).toBe(0);
});
