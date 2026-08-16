import assert from "node:assert/strict";
import test from "node:test";

import { AnalyzerFactory } from "../workers/ingest/analyzers";

const noNetworkFetch: typeof fetch = async () => {
  throw new Error("network call was not expected");
};

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
