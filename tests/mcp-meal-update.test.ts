import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAuthorizedAddMealRequest,
  type AddMealRequest,
  type AddMealRuntimeOptions,
  type StoredAddMealPhoto,
} from "../app/api/_lib/add-meal";
import { createMcpHandler, MCP_PROTOCOL_VERSION } from "../app/mcp/handler";
import { updateMcpMealByRequestId } from "../app/mcp/meal-update";
import {
  createMeal,
  createMealForExternalRequest,
  createMealsForExternalRequests,
  findMealByExternalRequestId,
  getNutritionSummary,
  listNutritionHistoryPage,
} from "../db/repository";
import { createSqliteTestDb } from "./helpers/sqlite-db";

const OWNER = "owner-a";
const REQUEST_ID = "9dd78408-9209-4b4d-9d42-dfa369d75ff0";
const OTHER_REQUEST_ID = "1e8b0f48-c58d-4678-9b4f-9d38eb847e45";
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

function addMealInput(input: AddMealRequest, photo: StoredAddMealPhoto | null) {
  return {
    name: input.name,
    kcal: input.kcal,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    consumedAt: input.consumedAt,
    source: "chatgpt",
    caption: input.name,
    ...(input.nutrients === undefined ? {} : { nutrients: input.nutrients }),
    photoKey: photo?.key ?? null,
    photoMimeType: photo?.mimeType ?? null,
    photoSizeBytes: photo?.sizeBytes ?? null,
  };
}

function routeFor(fixture: ReturnType<typeof createSqliteTestDb>, ownerKey = OWNER) {
  const addMealOptions: AddMealRuntimeOptions = {
    findExistingMeal: (owner, requestId) => findMealByExternalRequestId(fixture.db, owner, requestId),
    getDailyTotals: async (_owner, now) => ({
      date: new Date(now).toISOString().slice(0, 10),
      calories: 0,
      proteinG: 0,
      mealCount: 0,
    }),
    createMeal: (owner, input, photo) => createMealForExternalRequest(
      fixture.db,
      owner,
      input.requestId,
      addMealInput(input, photo),
    ),
    createMeals: (owner, requests) => createMealsForExternalRequests(
      fixture.db,
      owner,
      requests.map(({ request: input, photo }) => ({
        requestId: input.requestId,
        ...addMealInput(input, photo),
      })),
    ),
  };

  return createMcpHandler({
    authorize: async () => ({ ownerKey }),
    addMeals: (owner, body) => handleAuthorizedAddMealRequest(owner, body, addMealOptions),
    updateMeal: (owner, input) => updateMcpMealByRequestId({
      db: fixture.db,
      ownerKey: owner,
      input,
    }),
    getNutritionHistory: (owner, input) => listNutritionHistoryPage({
      db: fixture.db,
      ownerKey: owner,
      startDate: input.startDate,
      endDate: input.endDate,
      limit: input.pageSize,
      cursor: input.cursor,
    }),
    getNutritionSummary: (owner, input) => getNutritionSummary({
      db: fixture.db,
      ownerKey: owner,
      ...input,
    }),
  });
}

async function callTool({ route, name, arguments: arguments_, id = 1 }: {
  route: ReturnType<typeof routeFor>;
  name: string;
  arguments: Record<string, unknown>;
  id?: number;
}) {
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

function insertMeal(fixture: ReturnType<typeof createSqliteTestDb>, options: {
  id: string;
  ownerKey?: string;
  requestId: string;
  status?: string;
  oneItem?: boolean;
}) {
  const itemPrefix = options.id === "meal-edit" || options.id === "meal-single" ? "" : options.id + "-";
  return createMeal(fixture.db, options.ownerKey ?? OWNER, {
    id: options.id,
    externalRequestId: options.requestId,
    consumedAt: Date.parse("2026-09-24T12:00:00.000Z"),
    source: "chatgpt",
    caption: "Saved breakfast",
    status: options.status ?? "complete",
    photoKey: "photos/saved-breakfast.jpg",
    photoMimeType: "image/jpeg",
    photoSizeBytes: 321,
    items: options.oneItem
      ? [{
        id: itemPrefix + "item-single",
        name: "Oat bowl",
        quantity: 1,
        unit: "bowl",
        calories: 300,
        proteinG: 10,
        carbsG: 50,
        fatG: 5,
        fiberG: 4,
        magnesiumMg: 10,
        supplementalMagnesiumMg: 1,
      }]
      : [
        {
          id: itemPrefix + "item-oats",
          name: "Oats",
          quantity: 1,
          unit: "bowl",
          calories: 300,
          proteinG: 10,
          carbsG: 50,
          fatG: 5,
          fiberG: 4,
          magnesiumMg: 10,
          supplementalMagnesiumMg: 1,
          nutrientProvenance: { fiberG: "database" },
        },
        {
          id: itemPrefix + "item-rice",
          name: "Rice",
          quantity: 1,
          unit: "cup",
          calories: 200,
          proteinG: 20,
          carbsG: 25,
          fatG: 4,
          fiberG: 2,
          calciumMg: 100,
        },
      ],
  });
}

function countRows(fixture: ReturnType<typeof createSqliteTestDb>, table: "meal_logs" | "meal_revisions") {
  const result = fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM " + table).get() as { count: number };
  return result.count;
}

test("history IDs support a partial update and keep meal metadata and nutrient values", async () => {
  const fixture = createSqliteTestDb();
  await insertMeal(fixture, { id: "meal-edit", requestId: REQUEST_ID });
  await insertMeal(fixture, { id: "meal-other", requestId: OTHER_REQUEST_ID, oneItem: true });
  const route = routeFor(fixture);
  const history = await callTool({ route, name: "get_nutrition_history", arguments: {
    start_date: "2026-09-24",
    end_date: "2026-09-24",
  } });
  assert.equal(history.isError, false);
  const historyMeal = (history.structuredContent as {
    meals: Array<{ request_id: string; items: Array<{ id: string }> }>;
  }).meals.find((meal) => meal.request_id === REQUEST_ID);
  assert.ok(historyMeal);
  const oatsId = historyMeal.items.find((item) => item.id === "item-oats")?.id;
  assert.ok(oatsId);

  const updated = await callTool({ route, name: "update_meal", arguments: {
    request_id: historyMeal.request_id,
    patch: {
      name: "Corrected breakfast",
      eaten_at: "2026-09-24T13:30:00+07:00",
      kcal: 620,
      items: [{ id: oatsId, nutrients: { fiberG: 6 } }],
    },
  } });
  assert.equal(updated.isError, false);
  const result = updated.structuredContent as {
    status: string;
    meal_id: string;
    request_id: string;
    name: string;
    kcal: number;
    eaten_at: string;
    has_image: boolean;
    items: Array<{ id: string; kcal: number; nutrients: Record<string, number | null>; sourceFormAmounts: Record<string, number | null> }>;
  };
  assert.equal(result.status, "updated");
  assert.equal(result.meal_id, "meal-edit");
  assert.equal(result.request_id, REQUEST_ID);
  assert.equal(result.name, "Corrected breakfast");
  assert.equal(result.kcal, 620);
  assert.equal(result.eaten_at, "2026-09-24T06:30:00.000Z");
  assert.equal(result.has_image, true);
  assert.deepEqual(new Set(result.items.map((item) => item.id)), new Set(["item-oats", "item-rice"]));
  const oats = result.items.find((item) => item.id === "item-oats");
  const rice = result.items.find((item) => item.id === "item-rice");
  assert.equal(oats?.kcal, 420);
  assert.equal(oats?.nutrients.fiberG, 6);
  assert.equal(oats?.nutrients.magnesiumMg, 10);
  assert.equal(oats?.sourceFormAmounts.supplementalMagnesiumMg, 1);
  assert.equal(rice?.kcal, 200);
  assert.equal(rice?.nutrients.calciumMg, 100);

  const stored = await findMealByExternalRequestId(fixture.db, OWNER, REQUEST_ID);
  assert.ok(stored);
  assert.equal(stored.meal.photoKey, "photos/saved-breakfast.jpg");
  assert.equal(stored.meal.photoMimeType, "image/jpeg");
  assert.equal(stored.meal.photoSizeBytes, 321);
  assert.equal(stored.meal.externalRequestId, REQUEST_ID);
  const provenance = stored.items.find((item) => item.id === "item-oats")?.nutrientProvenanceJson;
  assert.match(provenance ?? "", /"fiberG":"manual"/u);

  const itemEdit = await callTool({ route, name: "update_meal", arguments: {
    request_id: REQUEST_ID,
    patch: { items: [{ id: "item-rice", name: "Brown rice", kcal: 240 }] },
  }, id: 2 });
  assert.equal(itemEdit.isError, false);
  const itemEditResult = itemEdit.structuredContent as {
    kcal: number;
    items: Array<{ id: string; name: string; kcal: number }>;
  };
  assert.equal(itemEditResult.kcal, 660);
  assert.equal(itemEditResult.items.find((item) => item.id === "item-rice")?.name, "Brown rice");
  assert.equal(itemEditResult.items.find((item) => item.id === "item-rice")?.kcal, 240);
  assert.equal(countRows(fixture, "meal_revisions"), 2);
  fixture.sqlite.close();
});

test("single-item nutrient patches merge changed fields and preserve all other nutrients", async () => {
  const fixture = createSqliteTestDb();
  await insertMeal(fixture, { id: "meal-single", requestId: REQUEST_ID, oneItem: true });
  const route = routeFor(fixture);
  const result = await callTool({ route, name: "update_meal", arguments: {
    request_id: REQUEST_ID,
    patch: { nutrients: { magnesiumMg: 25, fiberG: null } },
  } });
  assert.equal(result.isError, false);
  const updated = result.structuredContent as {
    items: Array<{ id: string; nutrients: Record<string, number | null>; sourceFormAmounts: Record<string, number | null> }>;
  };
  assert.equal(updated.items[0]?.id, "item-single");
  assert.equal(updated.items[0]?.nutrients.magnesiumMg, 25);
  assert.equal(updated.items[0]?.nutrients.fiberG, null);
  assert.equal(updated.items[0]?.sourceFormAmounts.supplementalMagnesiumMg, 1);
  fixture.sqlite.close();
});

test("invalid patches, foreign items, and non-completed or foreign meals do not write", async () => {
  const fixture = createSqliteTestDb();
  await insertMeal(fixture, { id: "meal-edit", requestId: REQUEST_ID });
  await insertMeal(fixture, { id: "meal-pending", requestId: OTHER_REQUEST_ID, status: "pending" });
  await insertMeal(fixture, {
    id: "meal-owner-b",
    ownerKey: "owner-b",
    requestId: "10c2c7fa-dce8-4f85-b2e8-181462ae76c1",
    oneItem: true,
  });
  const route = routeFor(fixture);
  const invalidInputs: Array<Record<string, unknown>> = [
    { request_id: "not-a-uuid", patch: { name: "Invalid" } },
    { request_id: REQUEST_ID, patch: {} },
    { request_id: REQUEST_ID, patch: { unknown: true } },
    { request_id: REQUEST_ID, patch: { name: " " } },
    { request_id: REQUEST_ID, patch: { kcal: -1 } },
    { request_id: REQUEST_ID, patch: { fat: 10_001 } },
    { request_id: REQUEST_ID, patch: { eaten_at: "2026-02-30T12:00:00Z" } },
    { request_id: REQUEST_ID, patch: { eaten_at: "2026-09-24T12:00:00" } },
    { request_id: REQUEST_ID, patch: { eaten_at: "4" } },
    { request_id: REQUEST_ID, patch: { photoKey: "replacement" } },
    { request_id: REQUEST_ID, patch: { request_id: OTHER_REQUEST_ID } },
    { request_id: REQUEST_ID, patch: { kcal: 600, items: [{ id: "item-oats", kcal: 500 }] } },
    { request_id: REQUEST_ID, patch: { items: [{ id: "item-oats" }] } },
    { request_id: REQUEST_ID, patch: { items: [{ id: "item-oats", name: "Oats" }, { id: "item-oats", name: "Oat" }] } },
    { request_id: REQUEST_ID, patch: { items: [{ id: "other-item", name: "Foreign" }] } },
    { request_id: REQUEST_ID, patch: { items: [{ id: "meal-owner-b-item-single", name: "Foreign" }] } },
    { request_id: REQUEST_ID, patch: { items: [{ id: "item-oats", nutrients: {} }] } },
    { request_id: REQUEST_ID, patch: { items: [{ id: "item-oats", nutrients: { unknown: 1 } }] } },
    { request_id: REQUEST_ID, patch: { nutrients: { magnesiumMg: 20 } } },
  ];
  for (const [index, input] of invalidInputs.entries()) {
    const result = await callTool({ route, name: "update_meal", arguments: input, id: index + 1 });
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent as { error: { code: string } }).error.code, "invalid_arguments");
  }
  for (const id of [OTHER_REQUEST_ID, "10c2c7fa-dce8-4f85-b2e8-181462ae76c1", "780ceea0-56c2-4a9e-b761-0b0dc74f1278"]) {
    const result = await callTool({ route, name: "update_meal", arguments: {
      request_id: id,
      patch: { name: "Must not change" },
    }, id: 20 });
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent as { error: { code: string } }).error.code, "not_found");
  }
  assert.equal(countRows(fixture, "meal_revisions"), 0);
  const unchanged = await findMealByExternalRequestId(fixture.db, OWNER, REQUEST_ID);
  assert.equal(unchanged?.meal.caption, "Saved breakfast");
  assert.equal(unchanged?.meal.totalCalories, 500);
  fixture.sqlite.close();
});

test("add_meals retry after an edit returns corrected stored values without creating a duplicate", async () => {
  const fixture = createSqliteTestDb();
  const route = routeFor(fixture);
  const meal = {
    request_id: REQUEST_ID,
    name: "Retry meal",
    kcal: 500,
    protein: 25,
    carbs: 60,
    fat: 15,
    eaten_at: "2026-09-24T12:00:00+07:00",
  };
  const first = await callTool({ route, name: "add_meals", arguments: { meals: [meal] } });
  assert.equal(first.isError, false);
  const update = await callTool({ route, name: "update_meal", arguments: {
    request_id: REQUEST_ID,
    patch: { kcal: 640, protein: 32 },
  }, id: 2 });
  assert.equal(update.isError, false);
  const retry = await callTool({ route, name: "add_meals", arguments: { meals: [meal] }, id: 3 });
  assert.equal(retry.isError, false);
  const payload = retry.structuredContent as {
    created_count: number;
    already_exists_count: number;
    meals: Array<{ status: string; request_id: string; kcal: number; protein: number }>;
  };
  assert.equal(payload.created_count, 0);
  assert.equal(payload.already_exists_count, 1);
  assert.equal(payload.meals[0]?.status, "already_exists");
  assert.equal(payload.meals[0]?.request_id, REQUEST_ID);
  assert.equal(payload.meals[0]?.kcal, 640);
  assert.equal(payload.meals[0]?.protein, 32);
  assert.equal(countRows(fixture, "meal_logs"), 1);
  fixture.sqlite.close();
});

test("updates reuse legacy UUIDs and the creation path's case normalization", async (t) => {
  const fixture = createSqliteTestDb();
  t.after(() => fixture.sqlite.close());
  const route = routeFor(fixture);
  const legacyId = "9dd78408-9209-1b4d-9d42-dfa369d75ff0";
  const created = await callTool({ route, name: "add_meals", arguments: { meals: [{
    request_id: legacyId.toUpperCase(),
    name: "Legacy meal",
    kcal: 300,
    protein: 10,
    carbs: 30,
    fat: 4,
    eaten_at: "2026-09-24T12:00:00Z",
  }] } });
  assert.equal(created.isError, false);
  const edited = await callTool({ route, name: "update_meal", arguments: {
    request_id: legacyId.toUpperCase(),
    patch: { name: "Corrected legacy meal" },
  } });
  assert.equal(edited.isError, false);
  const payload = edited.structuredContent as { request_id: string; name: string; kcal: number };
  assert.equal(payload.request_id, legacyId);
  assert.equal(payload.name, "Corrected legacy meal");
  assert.equal(payload.kcal, 300);
  assert.equal(countRows(fixture, "meal_logs"), 1);
});

test("macro reductions and repeated updates preserve coherent items and photos", async (t) => {
  const fixture = createSqliteTestDb();
  t.after(() => fixture.sqlite.close());
  await insertMeal(fixture, { id: "meal-edit", requestId: REQUEST_ID });
  const route = routeFor(fixture);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const edited = await callTool({ route, name: "update_meal", arguments: {
      request_id: REQUEST_ID,
      patch: { kcal: 50, protein: 0 },
    } });
    assert.equal(edited.isError, false);
    const payload = edited.structuredContent as {
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
      has_image: boolean;
      items: Array<{ id: string; kcal: number; protein: number; nutrients: Record<string, number | null> }>;
    };
    assert.equal(payload.kcal, 50);
    assert.equal(payload.protein, 0);
    assert.equal(payload.carbs, 75);
    assert.equal(payload.fat, 9);
    assert.equal(payload.has_image, true);
    assert.equal(payload.items.reduce((sum, item) => sum + item.kcal, 0), 50);
    assert.equal(payload.items.reduce((sum, item) => sum + item.protein, 0), 0);
    assert.equal(payload.items.find((item) => item.id === "item-oats")?.nutrients.magnesiumMg, 10);
  }
  assert.equal(countRows(fixture, "meal_logs"), 1);
  assert.equal(countRows(fixture, "meal_revisions"), 2);
});

test("overlapping meal and item nutrient corrections fail without writing", async (t) => {
  const fixture = createSqliteTestDb();
  t.after(() => fixture.sqlite.close());
  await insertMeal(fixture, { id: "meal-single", requestId: REQUEST_ID, oneItem: true });
  const result = await callTool({ route: routeFor(fixture), name: "update_meal", arguments: {
    request_id: REQUEST_ID,
    patch: {
      nutrients: { magnesiumMg: 20 },
      items: [{ id: "item-single", nutrients: { magnesiumMg: 30 } }],
    },
  } });
  assert.equal(result.isError, true);
  assert.equal((result.structuredContent as { error: { code: string } }).error.code, "invalid_arguments");
  assert.equal(countRows(fixture, "meal_revisions"), 0);
  const stored = await findMealByExternalRequestId(fixture.db, OWNER, REQUEST_ID);
  assert.equal(stored?.items[0]?.magnesiumMg, 10);
});
