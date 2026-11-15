import { createHash } from "node:crypto";
import type {
  AIServiceInterface,
  ModelAnswer,
  ModelRequest,
} from "../../ai/services/types.js";
import type { EvalCall } from "./types.js";

/**
 * Keeps each request and answer of another model service. The Logic keeps
 * only the output, and an eval also needs the model that answered and the
 * tokens.
 */
export class RecordingAIService<
  Role extends string,
> implements AIServiceInterface<Role> {
  readonly calls: EvalCall[] = [];
  private readonly running = new Set<Promise<ModelAnswer>>();

  constructor(private readonly inner: AIServiceInterface<Role>) {}

  get isConfigured(): boolean {
    return this.inner.isConfigured;
  }

  setApiKey(apiKey: string | null): void {
    this.inner.setApiKey(apiKey);
  }

  modelFor(role: Role): string {
    return this.inner.modelFor(role);
  }

  async generate(request: ModelRequest<Role>): Promise<ModelAnswer> {
    const started = Date.now();
    const call = this.inner.generate(request);
    this.running.add(call);
    let answer: ModelAnswer;
    try {
      answer = await call;
    } finally {
      this.running.delete(call);
    }
    this.calls.push({
      purpose: request.purpose,
      role: request.role,
      model: answer.model,
      requestedModel: this.inner.modelFor(request.role),
      inputTokens: answer.inputTokens,
      outputTokens: answer.outputTokens,
      ms: Date.now() - started,
      promptHash: hashOf({
        purpose: request.purpose,
        role: request.role,
        system: request.system,
        schema: request.schema,
        maxTokens: request.maxTokens,
      }),
      requestHash: requestHash(request),
      content: request.content
        .map((content) => (content.type === "text" ? content.text : ""))
        .join("\n"),
      output: answer.output,
    });
    return answer;
  }

  /**
   * When one of two calls at once fails, the Logic stops, but the other call
   * still costs money. Its cost is in `calls` only after this.
   */
  async settle(): Promise<void> {
    await Promise.allSettled(this.running);
  }
}

function hashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * The model is not in it, so the requests of two models compare. A prompt
 * that changed without a new version changes it.
 */
function requestHash<Role extends string>(request: ModelRequest<Role>): string {
  return hashOf({
    purpose: request.purpose,
    role: request.role,
    system: request.system,
    schema: request.schema,
    maxTokens: request.maxTokens,
    content: request.content.map((content) =>
      content.type === "text"
        ? content
        : {
            type: content.type,
            sha256: createHash("sha256").update(content.data).digest("hex"),
          },
    ),
  });
}
