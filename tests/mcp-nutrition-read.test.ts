import assert from "node:assert/strict";
import test from "node:test";

import { createMcpHandler, MCP_PROTOCOL_VERSION } from "../app/mcp/handler";
import { getNutritionSummary, listNutritionHistoryPage } from "../db/repository";
import { NUTRIENT_KEYS, NUTRIENT_UPPER_LIMIT_KEYS } from "../domain/nutrients";
import { createSqliteTestDb } from "./helpers/sqlite-db";

const OWNER = "owner-a";
const ACCEPT = "application/json, text/event-stream";

function request(body: unknown): Request {
  return new Request("https://calocount.test/mcp", {
    method: "POST",
    headers: {
      accept: ACCEPT,
      "content-type": "application/json",
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
    },
    body: JSON.stringify(body),
  });
}

function routeFor(fixture: ReturnType<typeof createSqliteTestDb>, ownerKey = OWNER) {
  return createMcpHandler({
    authorize: async () => ({ ownerKey }),
    addMeals: async () => Response.json({}),
    getNutritionHistory: (_ownerKey, input) => listNutritionHistoryPage({
      db: fixture.db,
      ownerKey: _ownerKey,
      from: input.from,
      to: input.to,
      limit: input.pageSize,
      cursor: input.cursor,
    }),
    getNutritionSummary: (_ownerKey, input) => getNutritionSummary({
      db: fixture.db,
      ownerKey: _ownerKey,
      ...input,
    }),
  });
}

async function callTool(route: ReturnType<typeof routeFor>, name: string, arguments_: Record<string, unknown>, id = 1) {
  const response = await route.POST(request({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: arguments_ },
  }));
  assert.equal(response.status, 200);
  const payload = await response.json() as {
    result: { isError: boolean; content: Array<{ text: string }>; structuredContent: unknown };
  };
  return payload.result;
}

function insertMeal(fixture: ReturnType<typeof createSqliteTestDb>, values: {
  id: string;
  ownerKey?: string;
  eatenAt: string;
  status?: string;
  mealType?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}) {
  fixture.sqlite.prepare(`
    INSERT INTO meal_logs (
      id, owner_key, consumed_at, status, meal_type,
      total_calories, total_protein_g, total_carbs_g, total_fat_g,
      caption, notes, photo_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'private caption', 'private note', 'private/photo-key')
  `).run(
    values.id,
    values.ownerKey ?? OWNER,
    Date.parse(values.eatenAt),
    values.status ?? "complete",
    values.mealType ?? "lunch",
    values.calories ?? 0,
    values.protein ?? 0,
    values.carbs ?? 0,
    values.fat ?? 0,
  );
}

function insertItem(fixture: ReturnType<typeof createSqliteTestDb>, values: {
  id: string;
  mealId: string;
  ownerKey?: string;
  name: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number | null;
  magnesium?: number | null;
  supplementalMagnesium?: number | null;
}) {
  fixture.sqlite.prepare(`
    INSERT INTO meal_items (
      id, meal_id, owner_key, name, quantity, unit,
      calories, protein_g, carbs_g, fat_g, fiber_g, magnesium_mg,
      supplemental_magnesium_mg, confidence, source, nutrient_provenance_json
    ) VALUES (?, ?, ?, ?, 1, 'serving', ?, ?, ?, ?, ?, ?, ?, 0.95, 'ai', '{"magnesiumMg":"private-source"}')
  `).run(
    values.id,
    values.mealId,
    values.ownerKey ?? OWNER,
    values.name,
    values.calories ?? 0,
    values.protein ?? 0,
    values.carbs ?? 0,
    values.fat ?? 0,
    values.fiber ?? null,
    values.magnesium ?? null,
    values.supplementalMagnesium ?? null,
  );
}

test("history is owner-scoped, paged in stable tie order, and returns safe complete nutrient maps", async () => {
  const fixture = createSqliteTestDb();
  const tiedTime = "2026-09-02T08:00:00.000Z";
  insertMeal(fixture, { id: "meal-z-private", eatenAt: tiedTime, mealType: "breakfast", calories: 400, protein: 20, carbs: 30, fat: 10 });
  insertMeal(fixture, { id: "meal-y-private", eatenAt: tiedTime, mealType: "lunch", calories: 300 });
  insertMeal(fixture, { id: "meal-a-private", eatenAt: "2026-09-01T10:00:00.000Z", calories: 200 });
  insertMeal(fixture, { id: "meal-pending-private", eatenAt: "2026-09-03T10:00:00.000Z", status: "pending" });
  insertMeal(fixture, { id: "other-owner-private", ownerKey: "owner-b", eatenAt: tiedTime });
  insertItem(fixture, {
    id: "item-private-id",
    mealId: "meal-z-private",
    name: "First food",
    calories: 400,
    protein: 20,
    carbs: 30,
    fat: 10,
    fiber: 3,
    magnesium: 0,
    supplementalMagnesium: 5,
  });
  insertItem(fixture, { id: "item-y-private", mealId: "meal-y-private", name: "Second food" });
  insertItem(fixture, { id: "item-a-private", mealId: "meal-a-private", name: "Older food" });
  insertItem(fixture, { id: "item-other-private", mealId: "other-owner-private", ownerKey: "owner-b", name: "Foreign food" });

  const route = routeFor(fixture);
  const first = await callTool(route, "get_nutrition_history", {
    start_date: "2026-09-01",
    end_date: "2026-09-02",
    page_size: 1,
  });
  assert.equal(first.isError, false);
  const firstData = first.structuredContent as {
    meals: Array<Record<string, unknown>>;
    has_more: boolean;
    next_cursor: string | null;
  };
  assert.equal(firstData.meals.length, 1);
  assert.equal(firstData.has_more, true);
  assert.equal(typeof firstData.next_cursor, "string");
  const firstMeal = firstData.meals[0] as {
    eaten_at: string;
    meal_type: string;
    items: Array<Record<string, unknown>>;
  };
  assert.equal(firstMeal.eaten_at, tiedTime);
  assert.equal(firstMeal.meal_type, "breakfast");
  assert.deepEqual(Object.keys(firstData.meals[0] ?? {}).sort(), ["date", "eaten_at", "items", "meal_type", "totals"]);
  const firstItem = firstMeal.items[0] as {
    nutrients: Record<string, number | null>;
    sourceFormAmounts: Record<string, number | null>;
  };
  assert.equal(firstItem.nutrients.magnesiumMg, 0);
  assert.equal(firstItem.nutrients.fiberG, 3);
  assert.equal(firstItem.nutrients.zincMg, null);
  assert.deepEqual(Object.keys(firstItem.nutrients).sort(), [...NUTRIENT_KEYS].sort());
  assert.equal(firstItem.sourceFormAmounts.supplementalMagnesiumMg, 5);
  assert.equal(firstItem.sourceFormAmounts.folicAcidMcg, null);
  assert.deepEqual(Object.keys(firstItem.sourceFormAmounts).sort(), [...NUTRIENT_UPPER_LIMIT_KEYS].sort());
  const firstJson = JSON.stringify(firstData);
  for (const secret of ["meal-z-private", "item-private-id", "owner-a", "private caption", "private note", "private/photo-key", "private-source", "confidence", "nutrientProvenanceJson"]) {
    assert.equal(firstJson.includes(secret), false);
  }

  const cursor = firstData.next_cursor;
  assert.ok(cursor);
  const changedRange = await callTool(route, "get_nutrition_history", {
    start_date: "2026-09-01",
    end_date: "2026-09-03",
    page_size: 1,
    cursor,
  }, 20);
  assert.equal(changedRange.isError, true);
  assert.match(changedRange.content[0]?.text ?? "", /invalid_cursor/u);
  const changedPageSize = await callTool(route, "get_nutrition_history", {
    start_date: "2026-09-01",
    end_date: "2026-09-02",
    page_size: 2,
    cursor,
  }, 21);
  assert.equal(changedPageSize.isError, true);
  assert.match(changedPageSize.content[0]?.text ?? "", /invalid_cursor/u);
  const otherOwnerRoute = routeFor(fixture, "owner-b");
  const otherOwnerCursor = await callTool(otherOwnerRoute, "get_nutrition_history", {
    start_date: "2026-09-01",
    end_date: "2026-09-02",
    page_size: 1,
    cursor,
  }, 22);
  assert.equal(otherOwnerCursor.isError, true);
  assert.match(otherOwnerCursor.content[0]?.text ?? "", /invalid_cursor/u);
  const second = await callTool(route, "get_nutrition_history", {
    start_date: "2026-09-01",
    end_date: "2026-09-02",
    page_size: 1,
    cursor,
  }, 2);
  const secondData = second.structuredContent as { meals: Array<{ items: Array<{ name: string }> }>; has_more: boolean; next_cursor: string | null };
  assert.equal(secondData.meals[0]?.items[0]?.name, "Second food");
  assert.equal(secondData.has_more, true);

  const third = await callTool(route, "get_nutrition_history", {
    start_date: "2026-09-01",
    end_date: "2026-09-02",
    page_size: 1,
    cursor: secondData.next_cursor as string,
  }, 3);
  const thirdData = third.structuredContent as { meals: Array<{ items: Array<{ name: string }> }>; has_more: boolean; next_cursor: string | null };
  assert.equal(thirdData.meals[0]?.items[0]?.name, "Older food");
  assert.equal(thirdData.has_more, false);
  assert.equal(thirdData.next_cursor, null);
  fixture.sqlite.close();
});

test("history rejects invalid dates, oversized ranges, and mismatched cursors", async () => {
  const fixture = createSqliteTestDb();
  const route = routeFor(fixture);
  const invalidDate = await callTool(route, "get_nutrition_history", { start_date: "2026-02-29", end_date: "2026-03-01" });
  assert.equal(invalidDate.isError, true);
  assert.deepEqual(invalidDate.structuredContent, { error: { code: "invalid_date", message: "start_date must be a real UTC calendar date." } });

  const oversized = await callTool(route, "get_nutrition_history", { start_date: "2025-01-01", end_date: "2026-01-02" }, 2);
  assert.equal(oversized.isError, true);
  assert.match(oversized.content[0]?.text ?? "", /date_range_too_large/u);

  const badCursor = await callTool(route, "get_nutrition_history", {
    start_date: "2026-09-01",
    end_date: "2026-09-01",
    cursor: "not-a-cursor",
  }, 3);
  assert.equal(badCursor.isError, true);
  assert.match(badCursor.content[0]?.text ?? "", /invalid_cursor/u);

  const nullPageSize = await callTool(route, "get_nutrition_history", {
    start_date: "2026-09-01",
    end_date: "2026-09-01",
    page_size: null,
  }, 4);
  assert.equal(nullPageSize.isError, true);
  assert.match(nullPageSize.content[0]?.text ?? "", /invalid_page_size/u);

  fixture.sqlite.close();
});

test("summary reports UTC day totals, unknown values, known zeroes, unlogged days, and current target scope", async () => {
  const fixture = createSqliteTestDb();
  insertMeal(fixture, { id: "day-one-a", eatenAt: "2026-09-01T08:00:00.000Z", calories: 500, protein: 20, carbs: 40, fat: 10 });
  insertMeal(fixture, { id: "day-one-b", eatenAt: "2026-09-01T12:00:00.000Z", calories: 300, protein: 10, carbs: 20, fat: 5 });
  insertItem(fixture, { id: "day-one-item-a", mealId: "day-one-a", name: "Known food", magnesium: 10, supplementalMagnesium: 5 });
  insertItem(fixture, { id: "day-one-item-b", mealId: "day-one-b", name: "Unknown food" });
  insertMeal(fixture, { id: "day-three", eatenAt: "2026-09-03T12:00:00.000Z", mealType: "snack" });
  insertItem(fixture, { id: "day-three-item", mealId: "day-three", name: "Known zero", magnesium: 0 });
  insertMeal(fixture, { id: "pending-day-two", eatenAt: "2026-09-02T10:00:00.000Z", status: "pending", calories: 900 });
  fixture.sqlite.prepare(`
    INSERT INTO settings (id, owner_key, daily_calorie_target, daily_protein_target_g, nutrient_targets_json)
    VALUES ('settings-owner-a', 'owner-a', 2000, 120, '{"magnesiumMg":350}')
  `).run();

  const result = await callTool(routeFor(fixture), "get_nutrition_summary", {
    start_date: "2026-09-01",
    end_date: "2026-09-03",
  });
  assert.equal(result.isError, false);
  const data = result.structuredContent as {
    days: Array<{
      date: string;
      status: string;
      mealCount: number;
      itemCount: number;
      totals: { caloriesKcal: number; proteinG: number; carbsG: number; fatG: number };
      nutrients: Record<string, { recordedAmount: number | null; knownItemCount: number; totalItemCount: number; complete: boolean }>;
      sourceFormAmounts: Record<string, { recordedAmount: number | null; knownItemCount: number; totalItemCount: number; complete: boolean }>;
    }>;
    currentTargets: { scope: string; caloriesKcal: number | null; protein: { grams: number | null }; nutrients: Record<string, { value: number | null }> };
  };
  assert.equal(data.days.length, 3);
  const firstDay = data.days[0];
  assert.ok(firstDay);
  assert.equal(firstDay.status, "logged");
  assert.equal(firstDay.mealCount, 2);
  assert.equal(firstDay.itemCount, 2);
  assert.deepEqual(firstDay.totals, { caloriesKcal: 800, proteinG: 30, carbsG: 60, fatG: 15 });
  assert.deepEqual(firstDay.nutrients.magnesiumMg, {
    recordedAmount: 10,
    knownItemCount: 1,
    totalItemCount: 2,
    complete: false,
  });
  assert.deepEqual(firstDay.sourceFormAmounts.supplementalMagnesiumMg, {
    recordedAmount: 5,
    knownItemCount: 1,
    totalItemCount: 2,
    complete: false,
  });
  assert.deepEqual(Object.keys(firstDay.nutrients).sort(), [...NUTRIENT_KEYS].sort());
  assert.deepEqual(Object.keys(firstDay.sourceFormAmounts).sort(), [...NUTRIENT_UPPER_LIMIT_KEYS].sort());

  const secondDay = data.days[1];
  assert.ok(secondDay);
  assert.equal(secondDay.status, "unlogged");
  assert.equal(secondDay.mealCount, 0);
  assert.equal(secondDay.itemCount, 0);
  assert.equal(secondDay.totals.caloriesKcal, 0);
  assert.deepEqual(secondDay.nutrients.magnesiumMg, {
    recordedAmount: null,
    knownItemCount: 0,
    totalItemCount: 0,
    complete: false,
  });

  const thirdDay = data.days[2];
  assert.ok(thirdDay);
  assert.equal(thirdDay.status, "logged");
  assert.deepEqual(thirdDay.nutrients.magnesiumMg, {
    recordedAmount: 0,
    knownItemCount: 1,
    totalItemCount: 1,
    complete: true,
  });
  assert.equal(data.currentTargets.scope, "current_settings_only");
  assert.equal(data.currentTargets.caloriesKcal, 2000);
  assert.equal(data.currentTargets.protein.grams, 120);
  assert.equal(data.currentTargets.nutrients.magnesiumMg?.value, 350);
  assert.equal(JSON.stringify(data).includes("historicalTarget"), false);
  fixture.sqlite.close();
});
