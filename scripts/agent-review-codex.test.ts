import assert from "node:assert/strict";
import test from "node:test";
import {
  OVERRIDE,
  argAfter,
  decode,
  finding,
  firstCall,
  repository,
  run,
} from "./agent-review-fixtures.ts";

test("codex gives the findings, and the model's commands do not get the login variable", async (context) => {
  const repo = await repository(context);
  const findings = [finding({ quote: OVERRIDE })];
  const result = await run({
    repo,
    command: "codex",
    env: {
      CODEX_AUTH_JSON: '{"tokens":{"refresh_token":"one"}}',
      FAKE_CODEX_MESSAGE: JSON.stringify({ findings }),
    },
  });

  assert.equal(result.status, 0, result.output);
  assert.equal(result.outputs.status, "ok");
  assert.deepEqual(decode(result.outputs.findings), findings);
  assert.equal(
    result.outputs.usage,
    "1,000 input tokens, 400 of them from the cache, and 20 output tokens",
  );
  const call = firstCall(result);
  assert.equal(call.hasLoginVariable, false);
  assert.equal(call.login, '{"tokens":{"refresh_token":"one"}}');
  assert.equal(argAfter(call.args, "--sandbox"), "read-only");
});

test("save-codex-login saves only a login that Codex refreshed", async (context) => {
  const repo = await repository(context);
  const seed = '{"tokens":{"refresh_token":"one"},"last_refresh":"2026-10-01"}';
  const refreshed =
    '{"last_refresh":"2026-10-19","tokens":{"refresh_token":"two"}}';
  const review = (login?: string) =>
    run({
      repo,
      command: "codex",
      env: {
        CODEX_AUTH_JSON: seed,
        FAKE_CODEX_MESSAGE: '{"findings":[]}',
        ...(login && { FAKE_CODEX_LOGIN: login }),
      },
    });
  const save = (token?: string) =>
    run({
      repo,
      command: "save-codex-login",
      env: { CODEX_AUTH_JSON: seed, ...(token && { GH_TOKEN: token }) },
    });

  // The same login with its keys in a different order is not a change.
  await review(
    '{"last_refresh":"2026-10-01","tokens":{"refresh_token":"one"}}',
  );
  const unchanged = await save("token");
  await review(refreshed);
  const saved = await save("token");
  await review(refreshed);
  const noToken = await save();

  assert.equal(unchanged.status, 0, unchanged.output);
  assert.deepEqual(unchanged.calls, []);
  assert.equal(saved.status, 0, saved.output);
  assert.deepEqual(saved.calls, [
    { call: "secret set CODEX_AUTH_JSON", input: refreshed },
  ]);
  assert.equal(noToken.status, 1);
  assert.match(noToken.output, /CODEX_AUTH_WRITE_TOKEN secret is not set/);
});
