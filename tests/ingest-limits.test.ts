import assert from "node:assert/strict";
import test from "node:test";

import {
  BoundedBodyError,
  MAX_PROVIDER_RESPONSE_BYTES,
  MAX_WEBHOOK_BODY_BYTES,
  readBoundedJson,
} from "../workers/ingest/http";

test("bounded JSON reader accepts a small response", async () => {
  const response = new Response(JSON.stringify({ ok: true }));
  assert.deepEqual(await readBoundedJson(response), { ok: true });
});
test("bounded JSON reader rejects declared and streamed oversized bodies", async () => {
  const declaredLarge = new Response("{}", {
    headers: { "content-length": String(MAX_PROVIDER_RESPONSE_BYTES + 1) },
  });
  await assert.rejects(() => readBoundedJson(declaredLarge, MAX_PROVIDER_RESPONSE_BYTES), BoundedBodyError);

  const oversized = new Response("x".repeat(MAX_WEBHOOK_BODY_BYTES + 1));
  await assert.rejects(() => readBoundedJson(oversized, MAX_WEBHOOK_BODY_BYTES), BoundedBodyError);
});
