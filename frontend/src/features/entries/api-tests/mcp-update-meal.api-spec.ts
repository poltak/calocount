import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("meal corrections", () => {
  test("should keep the other values and return the correction on the next read", async ({
    agent,
  }) => {
    const meal = {
      request_id: crypto.randomUUID(),
      name: "Oats",
      kcal: 400,
      protein: 20,
      carbs: 50,
      fat: 8,
      eaten_at: "2026-09-12T08:00:00Z",
    };
    await agent.callTool("add_meals", { meals: [meal] });
    const result = await agent.callTool("update_meal", {
      request_id: meal.request_id,
      patch: { kcal: 450 },
    });
    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toMatchObject({
      status: "updated",
      request_id: meal.request_id,
      name: "Oats",
      kcal: 450,
      protein: 20,
      carbs: 50,
      fat: 8,
    });
    const history = await agent.callTool("get_nutrition_history", {
      start_date: "2026-09-12",
      end_date: "2026-09-12",
    });
    expect(history.structuredContent).toMatchObject({
      meals: [
        {
          request_id: meal.request_id,
          totals: { caloriesKcal: 450, proteinG: 20, carbsG: 50, fatG: 8 },
        },
      ],
    });
  });
  test("should refuse an unknown request and an invalid patch without changing the meal", async ({
    agent,
  }) => {
    const requestId = crypto.randomUUID();
    await agent.callTool("add_meals", {
      meals: [
        {
          request_id: requestId,
          name: "Oats",
          kcal: 400,
          protein: 20,
          carbs: 50,
          fat: 8,
          eaten_at: "2026-09-12T08:00:00Z",
        },
      ],
    });
    const unknown = await agent.callTool("update_meal", {
      request_id: crypto.randomUUID(),
      patch: { kcal: 450 },
    });
    expect(unknown.isError).toBe(true);
    expect(unknown.structuredContent).toMatchObject({
      error: { code: "not_found" },
    });
    const invalid = await agent.callTool("update_meal", {
      request_id: requestId,
      patch: { kcal: -1 },
    });
    expect(invalid.isError).toBe(true);
    const history = await agent.callTool("get_nutrition_history", {
      start_date: "2026-09-12",
      end_date: "2026-09-12",
    });
    expect(history.structuredContent).toMatchObject({
      meals: [{ request_id: requestId, totals: { caloriesKcal: 400 } }],
    });
  });
});
