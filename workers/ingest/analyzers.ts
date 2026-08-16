import {
  ANALYSIS_SCHEMA_VERSION,
  MEAL_ANALYSIS_JSON_SCHEMA,
  PROMPT_VERSION,
  validateMealAnalysis,
} from "./schema";
import { MAX_PROVIDER_RESPONSE_BYTES, readBoundedJson } from "./http";
import type {
  AiTrace,
  AiUsageTrace,
  AiProfileConfig,
  AnalyzerFactoryEnvironment,
  AnalyzerFactoryOptions,
  MealAnalysisInput,
  MealAnalysisResponse,
  MealAnalyzer,
  OpenRouterAnalyzerOptions,
  XaiAnalyzerOptions,
} from "./types";

const DEFAULT_OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_XAI_ENDPOINT = "https://api.x.ai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = [
  "You estimate the nutrition of one meal from a photo and the user's description.",
  "Return only JSON that matches the supplied meal analysis schema.",
  "Use sensible portions. State uncertainty in assumptions and confidence.",
  "Do not give medical advice. Use null for a macro that cannot be estimated.",
  "Include every visible or described food as a separate item.",
].join(" ");

interface ProviderErrorPayload {
  readonly error?: unknown;
}

export class AnalyzerRequestError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, retryable: boolean, status: number | null = null) {
    super(message);
    this.name = "AnalyzerRequestError";
    this.retryable = retryable;
    this.status = status;
  }
}

function recordOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finiteValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function extractErrorMessage(payload: unknown): string {
  const root = recordOf(payload) as ProviderErrorPayload | null;
  const error = root?.error;
  const errorRecord = recordOf(error);
  const message = stringValue(errorRecord?.message) ?? stringValue(error);
  return message ? message.slice(0, 160) : "provider_error";
}

function extractJsonContent(payload: unknown): unknown {
  const root = recordOf(payload);
  const choices = root?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AnalyzerRequestError("provider_missing_choices", true);
  }

  const firstChoice = recordOf(choices[0]);
  const message = recordOf(firstChoice?.message);
  const content = message?.content;

  if (typeof content === "string") {
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new AnalyzerRequestError("provider_returned_invalid_json", true);
    }
  }

  if (Array.isArray(content)) {
    const textParts = content.flatMap((part) => {
      const partRecord = recordOf(part);
      const text = stringValue(partRecord?.text);
      return text ? [text] : [];
    });
    if (textParts.length > 0) {
      try {
        return JSON.parse(textParts.join("")) as unknown;
      } catch {
        throw new AnalyzerRequestError("provider_returned_invalid_json", true);
      }
    }
  }

  if (content && typeof content === "object") {
    return content;
  }

  throw new AnalyzerRequestError("provider_missing_content", true);
}

function extractUsage(payload: unknown): AiUsageTrace {
  const root = recordOf(payload);
  const usage = recordOf(root?.usage);
  const costDetails = recordOf(usage?.cost_details);
  return {
    inputTokens: finiteValue(usage?.prompt_tokens),
    outputTokens: finiteValue(usage?.completion_tokens),
    totalTokens: finiteValue(usage?.total_tokens),
    costUsd:
      finiteValue(usage?.cost) ??
      finiteValue(costDetails?.upstream_inference_cost),
  };
}

function extractProvider(payload: unknown): string | null {
  const root = recordOf(payload);
  const provider = root?.provider;
  if (typeof provider === "string") {
    return provider;
  }
  return stringValue(recordOf(provider)?.name);
}

function buildMessages(input: MealAnalysisInput): readonly Record<string, unknown>[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            `Description: ${input.caption || "(no description)"}`,
            `Captured at: ${input.capturedAt}`,
            input.timezone ? `Timezone: ${input.timezone}` : null,
            input.locale ? `Locale: ${input.locale}` : null,
          ]
            .filter((line): line is string => line !== null)
            .join("\n"),
        },
        {
          type: "image_url",
          image_url: { url: input.mediaUrl },
        },
      ],
    },
  ];
}

function responseFormat(): Record<string, unknown> {
  return {
    type: "json_schema",
    json_schema: {
      name: "calocount_meal_analysis",
      strict: true,
      schema: MEAL_ANALYSIS_JSON_SCHEMA,
    },
  };
}

async function fetchProvider(
  fetchFn: typeof fetch,
  endpoint: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ readonly payload: unknown; readonly latencyMs: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetchFn(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let payload: unknown;
    try {
      payload = await readBoundedJson(response, MAX_PROVIDER_RESPONSE_BYTES);
    } catch (error) {
      if (error instanceof AnalyzerRequestError) {
        throw error;
      }
      throw new AnalyzerRequestError(
        error instanceof Error && error.message === "body_too_large"
          ? "provider_response_too_large"
          : "provider_returned_invalid_response",
        response.status >= 500,
      );
    }

    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
      throw new AnalyzerRequestError(
        `provider_http_${response.status}_${extractErrorMessage(payload)}`,
        retryable,
        response.status,
      );
    }

    return { payload, latencyMs: Math.max(0, Date.now() - startedAt) };
  } catch (error) {
    if (error instanceof AnalyzerRequestError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AnalyzerRequestError("provider_timeout", true);
    }
    throw new AnalyzerRequestError("provider_network_error", true);
  } finally {
    clearTimeout(timeout);
  }
}

function traceFor(
  backend: AiTrace["backend"],
  requestedModel: string,
  payload: unknown,
  latencyMs: number,
  promptVersion = PROMPT_VERSION,
  schemaVersion = ANALYSIS_SCHEMA_VERSION,
): AiTrace {
  const root = recordOf(payload);
  return {
    backend,
    requestedModel,
    actualModel: stringValue(root?.model),
    upstreamProvider: extractProvider(payload),
    usage: extractUsage(payload),
    latencyMs,
    promptVersion,
    schemaVersion,
  };
}

function normaliseFallbackModels(models: readonly string[]): string[] {
  return [...new Set(models.map((model) => model.trim()).filter((model) => model.length > 0))];
}

export class OpenRouterMealAnalyzer implements MealAnalyzer {
  readonly backend = "openrouter" as const;
  private readonly options: OpenRouterAnalyzerOptions;
  private readonly fetchFn: typeof fetch;

  constructor(options: OpenRouterAnalyzerOptions) {
    this.options = {
      ...options,
      fallbackModels: normaliseFallbackModels(options.fallbackModels),
    };
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async analyze(input: MealAnalysisInput): Promise<MealAnalysisResponse> {
    const models = [this.options.model, ...this.options.fallbackModels].filter(
      (model, index, all) => all.indexOf(model) === index,
    );
    const provider: Record<string, unknown> = {
      allow_fallbacks: true,
      require_parameters: true,
      data_collection: "deny",
      zdr: true,
    };
    const body: Record<string, unknown> = {
      model: this.options.model,
      models,
      messages: buildMessages(input),
      response_format: responseFormat(),
      provider,
      temperature: 0,
    };
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.options.httpReferer) {
      headers["HTTP-Referer"] = this.options.httpReferer;
    }
    if (this.options.appName) {
      headers["X-Title"] = this.options.appName;
    }

    const response = await fetchProvider(
      this.fetchFn,
      this.options.endpoint ?? DEFAULT_OPENROUTER_ENDPOINT,
      headers,
      body,
    );
    const result = validateMealAnalysis(extractJsonContent(response.payload));
    return {
      result,
      trace: traceFor(
        this.backend,
        this.options.model,
        response.payload,
        response.latencyMs,
        this.options.promptVersion,
        this.options.schemaVersion,
      ),
    };
  }
}

export class DirectXaiMealAnalyzer implements MealAnalyzer {
  readonly backend = "xai" as const;
  private readonly options: XaiAnalyzerOptions;
  private readonly fetchFn: typeof fetch;

  constructor(options: XaiAnalyzerOptions) {
    this.options = options;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async analyze(input: MealAnalysisInput): Promise<MealAnalysisResponse> {
    const body: Record<string, unknown> = {
      model: this.options.model,
      messages: buildMessages(input),
      response_format: responseFormat(),
      temperature: 0,
      store: false,
    };
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.apiKey}`,
      "Content-Type": "application/json",
    };
    const response = await fetchProvider(
      this.fetchFn,
      this.options.endpoint ?? DEFAULT_XAI_ENDPOINT,
      headers,
      body,
    );
    const result = validateMealAnalysis(extractJsonContent(response.payload));
    return {
      result,
      trace: traceFor(
        this.backend,
        this.options.model,
        response.payload,
        response.latencyMs,
        this.options.promptVersion,
        this.options.schemaVersion,
      ),
    };
  }
}

function csv(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];
}

export class AnalyzerFactory {
  static create(
    environment: AnalyzerFactoryEnvironment,
    options: AnalyzerFactoryOptions = {},
  ): MealAnalyzer {
    const profile: AiProfileConfig | undefined = options.profile;
    const backend = (profile?.adapter ?? environment.AI_BACKEND ?? "openrouter").trim().toLowerCase();
    if (backend === "openrouter") {
      const model = profile?.primaryModel ?? environment.OPENROUTER_MODEL;
      if (!environment.OPENROUTER_API_KEY || !model) {
        throw new Error("OpenRouter is not configured");
      }
      return new OpenRouterMealAnalyzer({
        apiKey: environment.OPENROUTER_API_KEY,
        model,
        fallbackModels: profile?.fallbackModels ?? csv(environment.OPENROUTER_FALLBACK_MODELS),
        endpoint: profile?.endpoint ?? environment.OPENROUTER_ENDPOINT,
        httpReferer: environment.OPENROUTER_HTTP_REFERER,
        appName: environment.OPENROUTER_APP_NAME,
        promptVersion: profile?.promptVersion,
        schemaVersion: profile?.schemaVersion,
        fetchFn: options.fetchFn,
      });
    }

    if (backend === "xai" || backend === "direct-xai") {
      const model = profile?.primaryModel ?? environment.XAI_MODEL;
      if (!environment.XAI_API_KEY || !model) {
        throw new Error("xAI is not configured");
      }
      return new DirectXaiMealAnalyzer({
        apiKey: environment.XAI_API_KEY,
        model,
        endpoint: profile?.endpoint ?? environment.XAI_ENDPOINT,
        promptVersion: profile?.promptVersion,
        schemaVersion: profile?.schemaVersion,
        fetchFn: options.fetchFn,
      });
    }

    throw new Error("Unsupported AI backend");
  }
}
