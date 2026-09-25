import assert from "node:assert/strict";
import test from "node:test";

import { AddMealRequestError } from "../app/api/_lib/add-meal";
import { createMcpHandler, MCP_PROTOCOL_VERSION, type McpHandlerDependencies } from "../app/mcp/handler";

const ACCEPT = "application/json, text/event-stream";
const OWNER = { ownerKey: "owner-1", userId: "user-1", email: "owner@example.test" };

function request(body: unknown, options: {
  headers?: Record<string, string>;
  omitProtocolVersion?: boolean;
  rawBody?: string;
} = {}): Request {
  const headers: Record<string, string> = {
    accept: ACCEPT,
    "content-type": "application/json",
    "mcp-protocol-version": MCP_PROTOCOL_VERSION,
    ...options.headers,
  };
  if (options.omitProtocolVersion) delete headers["mcp-protocol-version"];
  return new Request("https://calocount.test/mcp", {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(body),
  });
}

function initializeRequest(id = 1): Request {
  return request({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
  }, { omitProtocolVersion: true });
}

function meal(requestId: string, name = "Lunch") {
  return {
    request_id: requestId,
    name,
    kcal: 500,
    protein: 30,
    carbs: 50,
    fat: 15,
    eaten_at: "2026-09-24T12:00:00+07:00",
  };
}

function mealBatchResponse(body: Record<string, unknown>): Response {
  const meals = body.meals as Array<Record<string, unknown>>;
  return Response.json({
    status: "batch_processed",
    created_count: meals.length,
    already_exists_count: 0,
    meals: meals.map((input, index) => ({
      status: "created",
      meal_id: `meal-${index + 1}`,
      request_id: input.request_id,
      name: input.name,
      kcal: input.kcal,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      eaten_at: "2026-09-24T05:00:00.000Z",
      has_image: Array.isArray(input.openaiFileIdRefs) && input.openaiFileIdRefs.length > 0,
    })),
  }, { status: 201 });
}

function toolCall(arguments_: Record<string, unknown>, id = 10): Request {
  return request({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: "add_meals", arguments: arguments_ },
  });
}

function handler(overrides: Partial<McpHandlerDependencies> = {}) {
  return createMcpHandler({
    authorize: async () => OWNER,
    addMeals: async () => new Response("{}", { status: 201 }),
    ...overrides,
  });
}

test("initializes and lists the single meal tool without session state", async () => {
  let authorizationCalls = 0;
  const route = handler({ authorize: async () => {
    authorizationCalls += 1;
    return OWNER;
  } });

  const initialize = await route.POST(initializeRequest());
  assert.equal(initialize.status, 200);
  assert.equal(initialize.headers.get("content-type")?.split(";", 1)[0], "application/json");
  assert.equal(initialize.headers.get("mcp-session-id"), null);
  const initializePayload = await initialize.json() as {
    jsonrpc: string;
    id: number;
    result: {
      protocolVersion: string;
      capabilities: { tools: Record<string, unknown> };
      serverInfo: { name: string; version: string };
      instructions: string;
    };
  };
  assert.equal(initializePayload.jsonrpc, "2.0");
  assert.equal(initializePayload.id, 1);
  const { instructions, ...initializeResult } = initializePayload.result;
  assert.deepEqual(initializeResult, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: { name: "calocount", version: "0.1.0" },
  });
  assert.ok(instructions.length <= 512);
  assert.match(instructions, /Estimate calories, protein, carbs, and fat before logging/u);
  assert.match(instructions, /only when the user clearly asks to log/u);
  assert.match(instructions, /ChatGPT-supplied photo file values.*photo_meal_indices/u);
  assert.match(instructions, /new UUID per meal.*reuse it only to retry/u);
  assert.match(instructions, /has_image is true/u);

  const list = await route.POST(request({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
  const listPayload = await list.json() as {
    result: { tools: Array<Record<string, unknown>> };
  };
  assert.equal(listPayload.result.tools.length, 1);
  const [tool] = listPayload.result.tools;
  assert.equal(tool?.name, "add_meals");
  assert.match(tool?.description as string, /generate a UUID v4 request_id.*code tool when available/u);
  const uuidInputSchema = tool?.inputSchema as {
    properties: { meals: { items: { properties: { request_id: { description: string } } } } };
  };
  assert.match(uuidInputSchema.properties.meals.items.properties.request_id.description, /crypto\.randomUUID\(\).*uuid\.uuid4\(\)/u);
  assert.match(uuidInputSchema.properties.meals.items.properties.request_id.description, /exact retry of the same meal details/u);
  assert.deepEqual(tool?.securitySchemes, [{ type: "oauth2", scopes: [] }]);
  assert.deepEqual(tool?._meta, {
    securitySchemes: [{ type: "oauth2", scopes: [] }],
    "openai/fileParams": ["photos"],
  });
  assert.deepEqual(tool?.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  });
  const inputSchema = tool?.inputSchema as {
    properties: {
      meals: { minItems: number; maxItems: number };
      photos: {
        maxItems: number;
        items: { properties: Record<string, unknown>; required: string[] };
      };
      photo_meal_indices: { maxItems: number; items: { type: string } };
    };
    required: string[];
  };
  assert.deepEqual(inputSchema.required, ["meals"]);
  assert.equal(inputSchema.properties.meals.minItems, 1);
  assert.equal(inputSchema.properties.meals.maxItems, 20);
  assert.equal(inputSchema.properties.photos.maxItems, 20);
  assert.deepEqual(inputSchema.properties.photos.items.required, ["download_url", "file_id"]);
  assert.deepEqual(Object.keys(inputSchema.properties.photos.items.properties).sort(), [
    "download_url",
    "file_id",
    "file_name",
    "mime_type",
  ]);
  assert.equal(inputSchema.properties.photo_meal_indices.maxItems, 20);
  assert.equal(inputSchema.properties.photo_meal_indices.items.type, "integer");
  assert.ok(tool?.outputSchema);
  assert.equal((tool?.outputSchema as { type: string }).type, "object");
  assert.equal(Array.isArray((tool?.outputSchema as { oneOf: unknown[] }).oneOf), true);
  assert.equal(authorizationCalls, 2);
});

test("maps one ChatGPT photo to the selected meal before the meal core runs", async () => {
  let received: Record<string, unknown> | undefined;
  const route = handler({
    addMeals: async (_ownerKey, body) => {
      received = body;
      return mealBatchResponse(body);
    },
  });

  const response = await route.POST(toolCall({
    meals: [meal("c5a84680-d0c7-4af6-a4f5-89495c3923ec")],
    photos: [{
      download_url: "https://files.oaiusercontent.com/file-123?sig=temporary",
      file_id: "file-123",
      mime_type: "image/png",
      file_name: "lunch.png",
    }],
    photo_meal_indices: [0],
  }));
  const payload = await response.json() as { result: { isError: boolean } };

  assert.equal(payload.result.isError, false);
  assert.deepEqual(received?.meals && (received.meals as Array<Record<string, unknown>>)[0]?.openaiFileIdRefs, [{
    id: "file-123",
    download_link: "https://files.oaiusercontent.com/file-123?sig=temporary",
    mime_type: "image/png",
    name: "lunch.png",
  }]);
  assert.equal(Object.hasOwn(received ?? {}, "photos"), false);
  assert.equal(Object.hasOwn(received ?? {}, "photo_meal_indices"), false);
});

test("maps multiple photos to selected meals in one mixed batch call", async () => {
  let writeCalls = 0;
  let received: Record<string, unknown> | undefined;
  const route = handler({
    addMeals: async (_ownerKey, body) => {
      writeCalls += 1;
      received = body;
      return mealBatchResponse(body);
    },
  });
  const inputs = [
    meal("c5a84680-d0c7-4af6-a4f5-89495c3923ec", "Breakfast"),
    meal("d7e4b7f1-8f16-4d6e-9f9c-b9f4d5d4b0b6", "Snack"),
    meal("27b84ee9-413b-4315-8f4a-ed5a5f602c2f", "Dinner"),
  ];
  const response = await route.POST(toolCall({
    meals: inputs,
    photos: [
      { download_url: "https://files.oaiusercontent.com/dinner", file_id: "dinner-id" },
      { download_url: "https://files.oaiusercontent.com/breakfast", file_id: "breakfast-id", file_name: "breakfast.jpg" },
    ],
    photo_meal_indices: [2, 0],
  }));
  const payload = await response.json() as { result: { isError: boolean } };
  const mappedMeals = received?.meals as Array<Record<string, unknown>>;

  assert.equal(payload.result.isError, false);
  assert.equal(writeCalls, 1);
  assert.deepEqual(mappedMeals[0]?.openaiFileIdRefs, [{
    id: "breakfast-id",
    download_link: "https://files.oaiusercontent.com/breakfast",
    name: "breakfast.jpg",
  }]);
  assert.equal(Object.hasOwn(mappedMeals[1] ?? {}, "openaiFileIdRefs"), false);
  assert.deepEqual(mappedMeals[2]?.openaiFileIdRefs, [{
    id: "dinner-id",
    download_link: "https://files.oaiusercontent.com/dinner",
  }]);
});

test("rejects invalid photo mappings without calling the meal core", async () => {
  let writeCalls = 0;
  const route = handler({
    addMeals: async () => {
      writeCalls += 1;
      return new Response("{}", { status: 201 });
    },
  });
  const oneMeal = meal("c5a84680-d0c7-4af6-a4f5-89495c3923ec");
  const validPhoto = { download_url: "https://files.oaiusercontent.com/file", file_id: "file-id" };
  const invalidArguments = [
    { meals: [oneMeal], photos: [validPhoto] },
    { meals: [oneMeal], photo_meal_indices: [0] },
    { meals: [oneMeal], photos: [validPhoto], photo_meal_indices: [] },
    { meals: [oneMeal], photos: [validPhoto], photo_meal_indices: [1] },
    { meals: [oneMeal], photos: [validPhoto, validPhoto], photo_meal_indices: [0, 0] },
    { meals: [oneMeal], photos: [{ download_url: validPhoto.download_url }], photo_meal_indices: [0] },
    { meals: [oneMeal], photos: [{ ...validPhoto, extra: "field" }], photo_meal_indices: [0] },
    { meals: [oneMeal], photos: [validPhoto], photo_meal_indices: [-1] },
    {
      meals: [oneMeal],
      photos: Array.from({ length: 21 }, () => validPhoto),
      photo_meal_indices: Array.from({ length: 21 }, (_, index) => index),
    },
  ];

  for (const [index, arguments_] of invalidArguments.entries()) {
    const response = await route.POST(toolCall(arguments_, 20 + index));
    const payload = await response.json() as {
      result: { isError: boolean; structuredContent: { error?: { code?: string } } };
    };
    assert.equal(payload.result.isError, true);
    assert.equal(payload.result.structuredContent.error?.code, "invalid_field");
  }
  assert.equal(writeCalls, 0);
});

test("accepts the initialized notification and unknown requests return method-not-found", async () => {
  const route = handler();
  const notification = await route.POST(request({ jsonrpc: "2.0", method: "notifications/initialized" }));
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), "");

  const unknown = await route.POST(request({ jsonrpc: "2.0", id: "unknown-1", method: "resources/list" }));
  assert.equal(unknown.status, 200);
  assert.deepEqual(await unknown.json(), {
    jsonrpc: "2.0",
    id: "unknown-1",
    error: { code: -32601, message: "Method not found" },
  });
});

test("rejects unsupported protocol versions on later requests", async () => {
  const route = handler();
  const response = await route.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }, {
    headers: { "mcp-protocol-version": "2024-11-05" },
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "unsupported_protocol_version",
      message: "The MCP protocol version is not supported.",
    },
  });
});

test("requires identity before parsing or dispatching every request", async () => {
  let addMealCalls = 0;
  const route = handler({
    authorize: async () => {
      throw Object.assign(new Error("Sign-in is required."), {
        name: "ApiError",
        status: 401,
        code: "unauthorized",
      });
    },
    addMeals: async () => {
      addMealCalls += 1;
      return new Response("{}", { status: 201 });
    },
  });

  const response = await route.POST(request(null, { rawBody: "not json" }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: { code: "unauthorized", message: "Sign-in is required." },
  });
  assert.equal(addMealCalls, 0);
});

test("rejects invalid JSON-RPC bodies and malformed meal arguments", async () => {
  const route = handler({
    addMeals: async () => {
      throw new AddMealRequestError(400, "missing_field", "request_id is required.");
    },
  });

  const malformedBody = await route.POST(request(null, { rawBody: "[1, 2]" }));
  assert.equal(malformedBody.status, 400);
  assert.deepEqual(await malformedBody.json(), {
    jsonrpc: "2.0",
    id: null,
    error: { code: -32700, message: "Parse error: Invalid JSON-RPC message" },
  });

  const malformedArguments = await route.POST(request({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "add_meals", arguments: { meals: [{ name: "Lunch" }] } },
  }));
  assert.equal(malformedArguments.status, 200);
  const payload = await malformedArguments.json() as {
    result: { content: Array<{ text: string }>; isError: boolean; structuredContent: unknown };
  };
  assert.equal(payload.result.isError, true);
  assert.equal(payload.result.content[0]?.text, "missing_field: request_id is required.");
  assert.deepEqual(payload.result.structuredContent, {
    error: { code: "missing_field", message: "request_id is required." },
  });
});

test("returns exact batch data and reports duplicate request IDs without claiming new meals", async () => {
  const savedRequestIds = new Set<string>();
  const route = handler({
    addMeals: async (_ownerKey, body) => {
      const meals = body.meals as Array<{ request_id: string }>;
      const requestId = meals[0]?.request_id ?? "";
      const alreadyExists = savedRequestIds.has(requestId);
      savedRequestIds.add(requestId);
      const payload = {
        status: "batch_processed",
        created_count: alreadyExists ? 0 : 1,
        already_exists_count: alreadyExists ? 1 : 0,
        meals: [{
          status: alreadyExists ? "already_exists" : "created",
          meal_id: "meal-1",
          request_id: requestId,
          name: "Lunch",
          kcal: 500,
          protein: 30,
          carbs: 50,
          fat: 15,
          eaten_at: "2026-09-24T05:00:00.000Z",
          has_image: false,
        }],
        daily_totals: { date: "2026-09-24", kcal: 1600, protein: 100, meal_count: 3 },
      };
      return Response.json(payload, { status: 201 });
    },
  });
  const meal = {
    request_id: "c5a84680-d0c7-4af6-a4f5-89495c3923ec",
    name: "Lunch",
    kcal: 500,
    protein: 30,
    carbs: 50,
    fat: 15,
    eaten_at: "2026-09-24T12:00:00+07:00",
  };
  const call = () => route.POST(request({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "add_meals", arguments: { meals: [meal] } },
  }));

  const created = await call();
  const createdPayload = await created.json() as {
    result: { content: Array<{ text: string }>; isError: boolean; structuredContent: unknown };
  };
  assert.equal(createdPayload.result.isError, false);
  assert.equal(createdPayload.result.content[0]?.text, "Added 1 new meal. 0 meals were already saved.");
  assert.deepEqual(createdPayload.result.structuredContent, {
    status: "batch_processed",
    created_count: 1,
    already_exists_count: 0,
    meals: [{
      status: "created",
      meal_id: "meal-1",
      request_id: meal.request_id,
      name: "Lunch",
      kcal: 500,
      protein: 30,
      carbs: 50,
      fat: 15,
      eaten_at: "2026-09-24T05:00:00.000Z",
      has_image: false,
    }],
    daily_totals: { date: "2026-09-24", kcal: 1600, protein: 100, meal_count: 3 },
  });

  const duplicate = await call();
  const duplicatePayload = await duplicate.json() as {
    result: { content: Array<{ text: string }>; isError: boolean; structuredContent: { created_count: number; already_exists_count: number } };
  };
  assert.equal(duplicatePayload.result.isError, false);
  assert.equal(duplicatePayload.result.content[0]?.text, "Added 0 new meals. 1 meal was already saved.");
  assert.equal(duplicatePayload.result.structuredContent.created_count, 0);
  assert.equal(duplicatePayload.result.structuredContent.already_exists_count, 1);
});

test("rejects oversized bodies before protocol checks or meal tracking", async () => {
  let addMealCalls = 0;
  const route = handler({
    addMeals: async () => {
      addMealCalls += 1;
      return new Response("{}", { status: 201 });
    },
  });
  const response = await route.POST(request(null, {
    rawBody: "x".repeat(1_000_001),
    omitProtocolVersion: true,
  }));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    error: { code: "payload_too_large", message: "The request is too large." },
  });
  assert.equal(addMealCalls, 0);
});

test("checks Origin and returns 405 for authenticated GET requests", async () => {
  let authorizationCalls = 0;
  const route = handler({ authorize: async () => {
    authorizationCalls += 1;
    return OWNER;
  } });

  const invalidOrigin = await route.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }, {
    headers: { origin: "https://outside.example" },
  }));
  assert.equal(invalidOrigin.status, 403);
  assert.equal(authorizationCalls, 0);

  const get = await route.GET(new Request("https://calocount.test/mcp", {
    method: "GET",
    headers: { accept: "text/event-stream", "mcp-protocol-version": MCP_PROTOCOL_VERSION },
  }));
  assert.equal(get.status, 405);
  assert.equal(authorizationCalls, 1);
  assert.equal(get.headers.get("access-control-allow-origin"), null);
});
