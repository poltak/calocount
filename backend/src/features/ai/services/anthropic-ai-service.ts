import type {
  AIServiceInterface,
  ModelAnswer,
  ModelContent,
  ModelRequest,
} from "./types.js";

export interface AnthropicConfiguration<Role extends string> {
  /** `null` until the settings or the environment give a key. */
  apiKey: string | null;
  /** Such as `https://api.anthropic.com`. */
  baseUrl: string;
  models: Record<Role, string>;
  /** The roles that run with no extended thinking. The other roles keep the default of their model. */
  thinkingOffRoles?: readonly Role[];
  /**
   * When the model declines a request, the API answers with another model.
   * Only the Sonnet line takes this fallback. The answer gives the model that
   * answered, so an eval can find such an answer.
   */
  fallbackOnRefusal?: boolean;
}

// A long input, such as the transcript of a long meeting, can make a request
// run for minutes.
const TIMEOUT_MS = 5 * 60_000;

const FALLBACK_MODEL_PREFIX = "claude-sonnet-";

/**
 * The `thinking` field that turns thinking off for the model. Each model
 * line has its own form, and a wrong form is a 400: Claude Sonnet 5.5 takes
 * only `between_tools`, and Claude Haiku 5.5 takes `disabled` at effort
 * `high` or lower. Both are at their default effort, `high` and `medium`.
 * For another model, the request sends no field, and its default applies.
 */
function thinkingOff(model: string): Record<string, unknown> {
  if (model.startsWith("claude-sonnet-5-5")) {
    return { thinking: { type: "between_tools" } };
  }
  if (model.startsWith("claude-haiku-5-5")) {
    return { thinking: { type: "disabled" } };
  }
  return {};
}

function toBlock(content: ModelContent): Record<string, unknown> {
  if (content.type === "text") {
    return { type: "text", text: content.text };
  }
  if (content.type === "pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from(content.data).toString("base64"),
      },
    };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: content.mediaType,
      data: Buffer.from(content.data).toString("base64"),
    },
  };
}

interface MessagesResponse {
  model?: string;
  stop_reason?: string;
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * The Anthropic Messages API, called with `fetch`. Each answer is JSON that
 * matches the schema of the request, through structured outputs.
 */
export class AnthropicAIService<
  Role extends string,
> implements AIServiceInterface<Role> {
  private apiKey: string | null;

  constructor(private readonly deps: AnthropicConfiguration<Role>) {
    this.apiKey = deps.apiKey;
  }

  get isConfigured(): boolean {
    return this.apiKey !== null;
  }

  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey;
  }

  modelFor(role: Role): string {
    return this.deps.models[role];
  }

  async generate(request: ModelRequest<Role>): Promise<ModelAnswer> {
    const apiKey = this.apiKey;
    if (apiKey === null) {
      throw new Error("The model provider is not configured");
    }
    const model = this.modelFor(request.role);
    const withFallback =
      this.deps.fallbackOnRefusal === true &&
      model.startsWith(FALLBACK_MODEL_PREFIX);
    const response = await fetch(new URL("/v1/messages", this.deps.baseUrl), {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        ...(withFallback
          ? { "anthropic-beta": "server-side-fallback-2026-07-01" }
          : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.content.map(toBlock) }],
        output_config: {
          format: { type: "json_schema", schema: request.schema },
        },
        ...(this.deps.thinkingOffRoles?.includes(request.role)
          ? thinkingOff(model)
          : {}),
        ...(withFallback ? { fallbacks: "default" } : {}),
      }),
    });
    if (!response.ok) {
      // The body names the problem, and it holds none of the request: it is
      // the error that the API writes about the request.
      throw new Error(
        `The model provider answered ${response.status}: ${(await response.text()).slice(0, 500)}`,
      );
    }
    const body = (await response.json()) as MessagesResponse;
    if (body.stop_reason === "refusal") {
      throw new Error("The model declined the request");
    }
    if (body.stop_reason === "max_tokens") {
      throw new Error("The model stopped before the answer was complete");
    }
    const text = (body.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    return {
      output: JSON.parse(text),
      model: body.model ?? model,
      inputTokens: body.usage?.input_tokens ?? null,
      outputTokens: body.usage?.output_tokens ?? null,
    };
  }
}
