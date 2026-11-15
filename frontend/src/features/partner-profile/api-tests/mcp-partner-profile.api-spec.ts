import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("partner log", () => {
  test("should refuse the partner while off and keep its log separate when on", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    const range = { start_date: "2026-09-12", end_date: "2026-09-12" };
    const refused = await agent.callTool("get_nutrition_history", {
      ...range,
      profile: "partner",
    });
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent).toMatchObject({
      error: { code: "profile_off" },
    });
    const meal = {
      request_id: crypto.randomUUID(),
      name: "Partner oats",
      kcal: 400,
      protein: 20,
      carbs: 50,
      fat: 8,
      eaten_at: "2026-09-12T08:00:00Z",
    };
    const writeOff = await agent.callTool("add_meals", {
      profile: "partner",
      meals: [meal],
    });
    expect(writeOff.isError).toBe(true);
    const enabled = await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { partnerProfileEnabled: true },
    });
    expect(enabled.status()).toBe(200);
    const saved = await agent.callTool("add_meals", {
      profile: "partner",
      meals: [meal],
    });
    expect(saved.structuredContent).toMatchObject({
      profile: "partner",
      created_count: 1,
    });
    const partner = await agent.callTool("get_nutrition_history", {
      ...range,
      profile: "partner",
    });
    expect(partner.structuredContent).toMatchObject({
      profile: "partner",
      meals: [
        { request_id: meal.request_id, items: [{ name: "Partner oats" }] },
      ],
    });
    const owner = await agent.callTool("get_nutrition_history", range);
    expect(owner.structuredContent).toMatchObject({
      profile: "owner",
      meals: [],
    });
  });
});
