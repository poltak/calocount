import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("nutrition reads", () => {
  test("should use the saved timezone and distinguish unlogged days, unknown nutrients and zero", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    const settings = await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { timezone: "Asia/Ho_Chi_Minh" },
    });
    expect(settings.status()).toBe(200);
    await agent.callTool("add_meals", {
      meals: [
        {
          request_id: crypto.randomUUID(),
          name: "Breakfast",
          kcal: 400,
          protein: 20,
          carbs: 50,
          fat: 8,
          nutrients: { magnesiumMg: 0 },
          eaten_at: "2026-09-11T23:30:00Z",
        },
      ],
    });
    const result = await agent.callTool("get_nutrition_summary", {
      start_date: "2026-09-11",
      end_date: "2026-09-12",
    });
    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toMatchObject({
      timezone: "Asia/Ho_Chi_Minh",
      days: [
        {
          date: "2026-09-11",
          status: "unlogged",
          mealCount: 0,
          nutrients: { magnesiumMg: { recordedAmount: null, complete: false } },
        },
        {
          date: "2026-09-12",
          status: "logged",
          mealCount: 1,
          totals: { caloriesKcal: 400 },
          nutrients: {
            magnesiumMg: { recordedAmount: 0, complete: true },
            zincMg: { recordedAmount: null, complete: false },
          },
        },
      ],
    });
    const history = await agent.callTool("get_nutrition_history", {
      start_date: "2026-09-12",
      end_date: "2026-09-12",
    });
    expect(history.structuredContent).toMatchObject({
      timezone: "Asia/Ho_Chi_Minh",
      meals: [
        {
          date: "2026-09-12",
          items: [
            { name: "Breakfast", nutrients: { magnesiumMg: 0, zincMg: null } },
          ],
        },
      ],
    });
  });
  test("should page the range with a cursor and refuse an oversized range", async ({
    agent,
  }) => {
    await agent.callTool("add_meals", {
      meals: ["2026-09-11T08:00:00Z", "2026-09-12T08:00:00Z"].map(
        (eaten_at) => ({
          request_id: crypto.randomUUID(),
          name: eaten_at,
          eaten_at,
          kcal: 100,
          protein: 10,
          carbs: 10,
          fat: 2,
        }),
      ),
    });
    const range = {
      start_date: "2026-09-11",
      end_date: "2026-09-12",
      page_size: 1,
    };
    const first = await agent.callTool("get_nutrition_history", range);
    expect(first.structuredContent).toMatchObject({
      has_more: true,
      next_cursor: expect.any(String),
      meals: [{ date: "2026-09-12" }],
    });
    const { next_cursor: cursor } = first.structuredContent as {
      next_cursor: string;
    };
    const second = await agent.callTool("get_nutrition_history", {
      ...range,
      cursor,
    });
    expect(second.structuredContent).toMatchObject({
      has_more: false,
      next_cursor: null,
      meals: [{ date: "2026-09-11" }],
    });
    for (const tool of ["get_nutrition_history", "get_nutrition_summary"]) {
      const refused = await agent.callTool(tool, {
        start_date: "2025-01-01",
        end_date: "2026-01-02",
      });
      expect(refused.isError).toBe(true);
      expect(refused.structuredContent).toMatchObject({
        error: { code: "date_range_too_large" },
      });
    }
  });
});
