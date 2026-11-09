import { AnthropicAIService } from "../../ai/services/anthropic-ai-service.js";
import { FakeAIService } from "../../ai/services/fake-ai-service.js";
import type { AIServiceInterface } from "../../ai/services/types.js";
import { RecordingAIService } from "./recording-ai-service.js";
import { ReplayAIService } from "./replay-ai-service.js";
import type { EvalAIService, EvalModel } from "./types.js";

// The composition root of the evals. Each eval runs the real Logic of the
// project, with the store of one case in memory in place of the database, so
// it sends the requests that the project sends. Put the function that
// constructs the Logic of an eval in this file.

export function createEvalAIService<Role extends string>(
  model: EvalModel<Role>,
): EvalAIService<Role> {
  let inner: AIServiceInterface<Role>;
  if (model.kind === "anthropic") {
    inner = new AnthropicAIService({
      apiKey: model.apiKey,
      baseUrl: "https://api.anthropic.com",
      models: model.models,
      ...(model.thinkingOffRoles
        ? { thinkingOffRoles: model.thinkingOffRoles }
        : {}),
      ...(model.fallbackOnRefusal ? { fallbackOnRefusal: true } : {}),
    });
    if (model.replay) {
      inner = new ReplayAIService(inner, model.replay);
    }
  } else {
    const fake = new FakeAIService<Role>();
    for (const [purpose, answer] of Object.entries(model.answers)) {
      fake.answer(purpose, answer);
    }
    inner = fake;
  }
  const ai = new RecordingAIService(inner);
  return { ai, calls: ai.calls, settle: () => ai.settle() };
}
