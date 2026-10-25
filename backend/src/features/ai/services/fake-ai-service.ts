import type { AIServiceInterface, ModelAnswer, ModelRequest } from "./types.js";

type Answer<Role extends string> = (request: ModelRequest<Role>) => unknown;

/**
 * A model for tests and evals. The caller gives the answer for each purpose.
 * The fake keeps each request, so a test can check what the model got.
 */
export class FakeAIService<
  Role extends string = string,
> implements AIServiceInterface<Role> {
  isConfigured = true;
  /** The key that the settings or the environment gave last. */
  apiKey: string | null = null;
  readonly requests: ModelRequest<Role>[] = [];
  private readonly answers = new Map<string, Answer<Role>>();
  private failing = false;

  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey;
    this.isConfigured = apiKey !== null;
  }

  modelFor(role: Role): string {
    return `fake-${role}-model`;
  }

  answer(purpose: string, answer: Answer<Role>): void {
    this.answers.set(purpose, answer);
  }

  stopAnswering(): void {
    this.failing = true;
  }

  startAnswering(): void {
    this.failing = false;
  }

  async generate(request: ModelRequest<Role>): Promise<ModelAnswer> {
    this.requests.push(request);
    if (this.failing) {
      throw new Error("The model provider did not answer");
    }
    const answer = this.answers.get(request.purpose);
    if (!answer) {
      throw new Error(`The fake model has no answer for ${request.purpose}`);
    }
    return {
      output: structuredClone(answer(request)),
      model: this.modelFor(request.role),
      inputTokens: 100,
      outputTokens: 50,
    };
  }
}
