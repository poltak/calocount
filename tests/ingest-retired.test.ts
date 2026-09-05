import assert from "node:assert/strict";
import test from "node:test";

import { ingestWorker, type IngestEnvironment } from "../workers/ingest/index";
import type { CleanupBucket } from "../workers/ingest/photo-cleanup";

const environment = {} as IngestEnvironment;
const context = {} as ExecutionContext;

test("maintenance Worker keeps retired Telegram and media paths unavailable", async () => {
  for (const path of [
    "/telegram/webhook",
    "/telegram/webhook/child",
    "/ai-media/",
    "/ai-media/token",
  ]) {
    const response = await ingestWorker.fetch(
      new Request(`https://example.test${path}`, path.startsWith("/telegram/") ? {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ update_id: 1 }),
      } : undefined),
      environment,
      context,
    );
    assert.equal(response.status, 404, path);
    assert.deepEqual(await response.json(), { error: "not_found" });
  }
  assert.equal("queue" in ingestWorker, false);
});

test("maintenance Worker keeps health check available", async () => {
  const response = await ingestWorker.fetch(
    new Request("https://example.test/healthz"),
    environment,
    context,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("scheduled maintenance runs shared photo cleanup without a queue", async () => {
  const linkedKey = "meals/linked/original";
  const orphanKey = "meals/orphan/original";
  const deleted: string[] = [];
  const bucket: CleanupBucket = {
    async list() {
      return {
        objects: [
          { key: linkedKey, uploaded: new Date(0) },
          { key: orphanKey, uploaded: new Date(0) },
        ],
        truncated: false,
      };
    },
    async delete(keys) {
      deleted.push(...(Array.isArray(keys) ? keys : [keys]).filter((key) => key.startsWith("meals/")));
    },
    async get() {
      return null;
    },
    async put() {
      return null;
    },
  };
  const db = {
    prepare() {
      return {
        bind(...values: unknown[]) {
          return {
            async all() {
              return {
                results: values
                  .filter((value): value is string => value === linkedKey)
                  .map((photo_key) => ({ photo_key })),
              };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  await ingestWorker.scheduled(
    {} as ScheduledController,
    { DB: db, MEAL_PHOTOS: bucket },
    context,
  );

  assert.deepEqual(deleted, [orphanKey]);
});

test("scheduled maintenance logs a fixed error when cleanup fails", async () => {
  const bucket: CleanupBucket = {
    async list() {
      throw new Error("private_cleanup_detail");
    },
    async delete() {},
    async get() {
      return null;
    },
    async put() {
      return null;
    },
  };
  const messages: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  try {
    await ingestWorker.scheduled(
      {} as ScheduledController,
      { DB: {} as D1Database, MEAL_PHOTOS: bucket },
      context,
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(messages.length, 1);
  assert.match(messages[0] ?? "", /cleanup_failed/);
  assert.doesNotMatch(messages[0] ?? "", /private_cleanup_detail/);
});
