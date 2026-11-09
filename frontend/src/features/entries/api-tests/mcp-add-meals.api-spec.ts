import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";
import { McpClient } from "../../core/api-tests/mcp-client.js";
import { TodayPageObject } from "../black-box-tests/today-page-object.js";

const TOOLS = [
  "add_meals",
  "get_nutrition_history",
  "get_nutrition_summary",
  "get_weight_history",
  "update_meal",
];

function oatMeal(eatenAt: Date) {
  return {
    request_id: crypto.randomUUID(),
    name: "Agent oats",
    kcal: 410,
    protein: 18,
    carbs: 60,
    fat: 9,
    eaten_at: eatenAt.toISOString(),
  };
}

test.describe("an agent that the owner connected", () => {
  test("should list the Calocount tools", async ({ agent }) => {
    const tools = await agent.listTools();

    expect(tools.map((tool) => tool.name).toSorted()).toEqual(TOOLS);
  });

  test("should add a meal that the owner then sees on the dashboard", async ({
    agent,
    ownerPage,
  }) => {
    const result = await agent.callTool("add_meals", {
      meals: [oatMeal(new Date())],
    });

    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toMatchObject({
      status: "batch_processed",
      created_count: 1,
      already_exists_count: 0,
    });
    const today = new TodayPageObject(ownerPage);
    await today.goto();
    await expect(today.entryMacros("Agent oats")).toContainText(
      "Energy410 kcal",
    );
  });

  test("should save a meal once when the agent sends the same request again", async ({
    agent,
  }) => {
    const meal = oatMeal(new Date());

    await agent.callTool("add_meals", { meals: [meal] });
    const again = await agent.callTool("add_meals", { meals: [meal] });

    expect(again.structuredContent).toMatchObject({
      created_count: 0,
      already_exists_count: 1,
    });
  });
});

test.describe("an MCP client with no token", () => {
  test("should be sent to the OAuth discovery documents", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const client = new McpClient({
      request: anonymousRequest,
      origin: apiOrigin,
      accessToken: null,
    });

    const response = await client.send("tools/list");

    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toContain(
      `resource_metadata="${apiOrigin}/.well-known/oauth-protected-resource`,
    );
  });
});

test.describe("meal batches", () => {
  test("should save several meals and return their daily totals", async ({
    agent,
  }) => {
    const first = oatMeal(new Date());
    const second = { ...oatMeal(new Date()), name: "Second oats" };
    const result = await agent.callTool("add_meals", {
      meals: [first, second],
    });
    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toMatchObject({
      created_count: 2,
      already_exists_count: 0,
      meals: [
        { request_id: first.request_id },
        { request_id: second.request_id },
      ],
      daily_totals: { kcal: 820, protein: 36, meal_count: 2 },
    });
  });
  test("should refuse an invalid field without saving any meal", async ({
    agent,
  }) => {
    const result = await agent.callTool("add_meals", {
      meals: [oatMeal(new Date()), { ...oatMeal(new Date()), kcal: -1 }],
    });
    expect(result.isError).toBe(true);
    const date = new Date().toISOString().slice(0, 10);
    const history = await agent.callTool("get_nutrition_history", {
      start_date: date,
      end_date: date,
    });
    expect(history.structuredContent).toMatchObject({ meals: [] });
  });
});
