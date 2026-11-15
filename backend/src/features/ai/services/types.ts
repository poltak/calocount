export type ModelContent =
  | { type: "text"; text: string }
  | { type: "pdf"; data: Uint8Array }
  | {
      type: "image";
      mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
      data: Uint8Array;
    };

/**
 * `Role` names the work that a request does, such as `"extraction"`. Each
 * project gives its own roles, and the deployment chooses a model for each
 * one.
 */
export interface ModelRequest<Role extends string = string> {
  /** What the request is for. It names the request in logs, fakes, and evals. */
  purpose: string;
  role: Role;
  system: string;
  content: ModelContent[];
  /** The JSON Schema of the answer. The answer is JSON that matches it. */
  schema: Record<string, unknown>;
  maxTokens: number;
}

export interface ModelAnswer {
  output: unknown;
  /** The model that answered. A provider can answer with another model than the one of the role. */
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * A language model. `generate` rejects when the provider does not answer, or
 * declines, or stops before the answer is complete.
 */
export interface AIServiceInterface<Role extends string = string> {
  /** `false` while the service has no key for the provider. */
  readonly isConfigured: boolean;
  /** `null` removes the key, and each request then rejects. */
  setApiKey(apiKey: string | null): void;
  modelFor(role: Role): string;
  generate(request: ModelRequest<Role>): Promise<ModelAnswer>;
}
