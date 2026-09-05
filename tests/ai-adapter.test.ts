import assert from "node:assert/strict";
import test from "node:test";

import {
  AnalyzerFactory,
  AnalyzerRequestError,
  DirectXaiMealAnalyzer,
  OpenRouterMealAnalyzer,
} from "../workers/ingest/analyzers";
import {
  MEAL_ANALYSIS_JSON_SCHEMA,
  MealAnalysisValidationError,
} from "../workers/ingest/schema";
import type { MealAnalysisInput } from "../workers/ingest/types";

const noNetworkFetch: typeof fetch = async () => {
  throw new Error("network call was not expected");
};

const analysisInput: MealAnalysisInput = {
  caption: "Chicken, rice, and vegetables",
  mediaUrl: "https://media.example.test/signed/meal.jpg",
  capturedAt: "2026-08-16T12:34:56.000Z",
  timezone: "Asia/Ho_Chi_Minh",
  locale: "en-VN",
};

const validAnalysis = {
  summary: "A chicken rice bowl with vegetables",
  items: [
    {
      name: "Chicken breast",
      serving: "one grilled breast",
      grams: 180,
      calories: 300,
      proteinGrams: 50,
      carbsGrams: 0,
      fatGrams: 8,
      confidence: "medium",
      assumptions: ["No added oil was visible"],
    },
    {
      name: "Rice",
      serving: "one cup cooked",
      grams: 160,
      calories: 210,
      proteinGrams: 4,
      carbsGrams: 45,
      fatGrams: 1,
      confidence: "medium",
      assumptions: [],
    },
  ],
  totals: {
    // Deliberately different from the item totals. The application recalculates
    // these values after validation.
    calories: 999,
    proteinGrams: 999,
    carbsGrams: 999,
    fatGrams: 999,
  },
  confidence: "medium",
  assumptions: ["Portions are estimated from the photo"],
  questions: ["Was oil used when cooking the chicken?"],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestBody(init: RequestInit | undefined): Record<string, unknown> {
  assert.ok(init?.body, "the analyzer should send a request body");
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

function providerResponse(options: {
  readonly content: unknown;
  readonly model?: string;
  readonly provider?: unknown;
  readonly usage?: Record<string, unknown>;
}): unknown {
  return {
    model: options.model ?? "provider-model",
    provider: options.provider ?? "provider-name",
    choices: [{ message: { content: options.content } }],
    usage: options.usage ?? {
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
      cost: 0.00042,
    },
  };
}

function openRouterAnalyzer(fetchFn: typeof fetch): OpenRouterMealAnalyzer {
  return new OpenRouterMealAnalyzer({
    apiKey: "router-secret",
    model: "primary/vision",
    fallbackModels: [],
    endpoint: "https://router.example.test/v1/chat/completions",
    fetchFn,
  });
}

function xaiAnalyzer(fetchFn: typeof fetch): DirectXaiMealAnalyzer {
  return new DirectXaiMealAnalyzer({
    apiKey: "xai-secret",
    model: "grok-vision",
    endpoint: "https://xai.example.test/v1/chat/completions",
    fetchFn,
  });
}

async function expectRequestError(
  operation: () => Promise<unknown>,
  expected: {
    readonly message: string;
    readonly retryable: boolean;
    readonly status: number | null;
  },
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof AnalyzerRequestError);
    assert.equal(error.message, expected.message);
    assert.equal(error.retryable, expected.retryable);
    assert.equal(error.status, expected.status);
    return true;
  });
}

test("AnalyzerFactory selects OpenRouter by default", () => {
  const analyzer = AnalyzerFactory.create(
    {
      OPENROUTER_API_KEY: "router-key",
      OPENROUTER_MODEL: "test/vision-model",
    },
    { fetchFn: noNetworkFetch },
  );
  assert.equal(analyzer.backend, "openrouter");
});

test("AnalyzerFactory selects direct xAI when configured", () => {
  const analyzer = AnalyzerFactory.create(
    {
      AI_BACKEND: "xai",
      XAI_API_KEY: "xai-key",
      XAI_MODEL: "grok-test",
    },
    { fetchFn: noNetworkFetch },
  );
  assert.equal(analyzer.backend, "xai");
});

test("AnalyzerFactory fails closed for unsupported or incomplete providers", () => {
  assert.throws(() => AnalyzerFactory.create({ AI_BACKEND: "unknown" }));
  assert.throws(() => AnalyzerFactory.create({ AI_BACKEND: "openrouter" }));
});

test("OpenRouter sends structured, private multimodal requests and extracts its trace", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  const fetchFn: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenInit = init;
    return jsonResponse(
      providerResponse({
        content: JSON.stringify(validAnalysis),
        model: "actual/router-vision",
        provider: { name: "router-upstream" },
      }),
    );
  };

  const analyzer = new OpenRouterMealAnalyzer({
    apiKey: "router-secret",
    model: "primary/vision",
    fallbackModels: [
      " fallback/one ",
      "primary/vision",
      "fallback/one",
      "fallback/two",
      "  ",
    ],
    endpoint: "https://router.example.test/v1/chat/completions",
    httpReferer: "https://calocount.example.test",
    appName: "Calocount test",
    promptVersion: "prompt.test",
    schemaVersion: "schema.test",
    fetchFn,
  });

  const response = await analyzer.analyze(analysisInput);
  const body = requestBody(seenInit);
  const headers = new Headers(seenInit?.headers);
  const messages = body.messages as Array<Record<string, unknown>>;
  const userContent = messages[1]?.content as Array<Record<string, unknown>>;
  const imageBlock = userContent[1]?.image_url as Record<string, unknown>;
  const responseFormat = body.response_format as Record<string, unknown>;
  const jsonSchema = responseFormat.json_schema as Record<string, unknown>;

  assert.equal(seenUrl, "https://router.example.test/v1/chat/completions");
  assert.equal(headers.get("Authorization"), "Bearer router-secret");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(headers.get("HTTP-Referer"), "https://calocount.example.test");
  assert.equal(headers.get("X-Title"), "Calocount test");
  assert.equal(body.model, "primary/vision");
  assert.deepEqual(body.models, ["primary/vision", "fallback/one", "fallback/two"]);
  assert.deepEqual(body.provider, {
    allow_fallbacks: true,
    require_parameters: true,
    data_collection: "deny",
    zdr: true,
  });
  assert.equal(body.temperature, 0);
  assert.equal(responseFormat.type, "json_schema");
  assert.equal(jsonSchema.name, "calocount_meal_analysis");
  assert.equal(jsonSchema.strict, true);
  assert.deepEqual(jsonSchema.schema, MEAL_ANALYSIS_JSON_SCHEMA);
  assert.match(String(userContent[0]?.text), /Chicken, rice, and vegetables/);
  assert.match(String(userContent[0]?.text), /Asia\/Ho_Chi_Minh/);
  assert.deepEqual(imageBlock, { url: analysisInput.mediaUrl });

  assert.equal(response.result.totals.calories, 510);
  assert.equal(response.result.totals.proteinGrams, 54);
  assert.equal(response.result.totals.carbsGrams, 45);
  assert.equal(response.result.totals.fatGrams, 9);
  assert.equal(response.trace.backend, "openrouter");
  assert.equal(response.trace.requestedModel, "primary/vision");
  assert.equal(response.trace.actualModel, "actual/router-vision");
  assert.equal(response.trace.upstreamProvider, "router-upstream");
  assert.deepEqual(response.trace.usage, {
    inputTokens: 11,
    outputTokens: 7,
    totalTokens: 18,
    costUsd: 0.00042,
  });
  assert.equal(response.trace.promptVersion, "prompt.test");
  assert.equal(response.trace.schemaVersion, "schema.test");
  assert.ok(response.trace.latencyMs >= 0);
});

test("direct xAI sends store=false and validates array text content", async () => {
  let seenInit: RequestInit | undefined;
  const fetchFn: typeof fetch = async (_input, init) => {
    seenInit = init;
    return jsonResponse(
      providerResponse({
        content: [{ type: "text", text: JSON.stringify(validAnalysis) }],
        model: "grok-vision-actual",
        provider: "xai",
      }),
    );
  };

  const response = await xaiAnalyzer(fetchFn).analyze(analysisInput);
  const body = requestBody(seenInit);
  const headers = new Headers(seenInit?.headers);
  const messages = body.messages as Array<Record<string, unknown>>;
  const userContent = messages[1]?.content as Array<Record<string, unknown>>;
  const imageBlock = userContent[1]?.image_url as Record<string, unknown>;

  assert.equal(headers.get("Authorization"), "Bearer xai-secret");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(body.model, "grok-vision");
  assert.equal(body.store, false);
  assert.equal(body.models, undefined);
  assert.equal(body.provider, undefined);
  assert.equal(body.temperature, 0);
  assert.deepEqual(imageBlock, { url: analysisInput.mediaUrl });
  assert.equal(response.result.items.length, 2);
  assert.equal(response.trace.backend, "xai");
  assert.equal(response.trace.actualModel, "grok-vision-actual");
  assert.equal(response.trace.upstreamProvider, "xai");
});

test("429 and 5xx provider responses are marked retryable", async () => {
  for (const status of [429, 500]) {
    const analyzer = openRouterAnalyzer(async () =>
      jsonResponse({ error: { message: "temporary provider failure" } }, status),
    );
    await expectRequestError(
      () => analyzer.analyze(analysisInput),
      {
        message: `provider_http_${status}_temporary provider failure`,
        retryable: true,
        status,
      },
    );
  }
});

test("ordinary provider 4xx responses are not retryable", async () => {
  const analyzer = openRouterAnalyzer(async () =>
    jsonResponse({ error: { message: "invalid request" } }, 400),
  );
  await expectRequestError(
    () => analyzer.analyze(analysisInput),
    {
      message: "provider_http_400_invalid request",
      retryable: false,
      status: 400,
    },
  );
});

test("non-JSON provider errors preserve HTTP status and retry policy", async () => {
  for (const status of [400, 402, 408, 409, 429, 503]) {
    const analyzer = openRouterAnalyzer(async () => new Response("upstream error", { status }));
    await expectRequestError(() => analyzer.analyze(analysisInput), {
      message: `provider_http_${status}_provider_error`,
      retryable: [408, 409, 429, 503].includes(status),
      status,
    });
  }
});

test("provider response body aborts and network failures remain retryable", async () => {
  for (const error of [new DOMException("aborted", "AbortError"), new TypeError("connection reset")]) {
    const analyzer = openRouterAnalyzer(async () => new Response(new ReadableStream({
      start(controller) {
        controller.error(error);
      },
    })));
    await expectRequestError(() => analyzer.analyze(analysisInput), {
      message: error.name === "AbortError" ? "provider_timeout" : "provider_network_error",
      retryable: true,
      status: null,
    });
  }
});

test("malformed provider content returns a retryable analyzer error", async () => {
  const analyzer = openRouterAnalyzer(async () =>
    jsonResponse(providerResponse({ content: "this is not json" })),
  );
  await expectRequestError(
    () => analyzer.analyze(analysisInput),
    {
      message: "provider_returned_invalid_json",
      retryable: true,
      status: null,
    },
  );
});

test("schema-invalid provider JSON is rejected before it is stored", async () => {
  const malformed = { ...validAnalysis, items: [] };
  const analyzer = openRouterAnalyzer(async () =>
    jsonResponse(providerResponse({ content: JSON.stringify(malformed) })),
  );
  await assert.rejects(
    () => analyzer.analyze(analysisInput),
    (error: unknown) => {
      assert.ok(error instanceof MealAnalysisValidationError);
      return true;
    },
  );
});

test("network errors are converted to retryable analyzer errors", async () => {
  const analyzer = openRouterAnalyzer(async () => {
    throw new TypeError("provider is offline");
  });
  await expectRequestError(
    () => analyzer.analyze(analysisInput),
    {
      message: "provider_network_error",
      retryable: true,
      status: null,
    },
  );
});
