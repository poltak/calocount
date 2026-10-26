import type {
  AIServiceInterface,
  ModelAnswer,
  ModelRequest,
} from "../../ai/services/types.js";

/**
 * Gives the recorded output of an earlier run for some purposes, and sends
 * the other requests to another service. An eval of a later step then gives
 * each model of that step the same input, and pays only for that step.
 */
export class ReplayAIService<
  Role extends string,
> implements AIServiceInterface<Role> {
  constructor(
    private readonly inner: AIServiceInterface<Role>,
    private readonly recorded: Record<string, unknown>,
  ) {}

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
    if (!(request.purpose in this.recorded)) {
      return this.inner.generate(request);
    }
    return {
      output: structuredClone(this.recorded[request.purpose]),
      model: "replay",
      inputTokens: null,
      outputTokens: null,
    };
  }
}
