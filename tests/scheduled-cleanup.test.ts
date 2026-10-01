import assert from "node:assert/strict";
import test from "node:test";

import type { CleanupBucket } from "../worker/photo-cleanup";
import { runScheduledPhotoCleanup } from "../worker/scheduled";

function bucketWith(objects: Array<{ key: string; uploaded: Date }>, deleted: string[]): CleanupBucket {
  return {
    async list() {
      return { objects, truncated: false };
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
}

/** A database in which only the given photo keys are linked to a meal. */
function databaseLinking(linkedKeys: string[]): D1Database {
  return {
    prepare() {
      return {
        bind(...values: unknown[]) {
          return {
            async all() {
              return {
                results: values
                  .filter((value): value is string => typeof value === "string" && linkedKeys.includes(value))
                  .map((photo_key) => ({ photo_key })),
              };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

async function captureConsole(method: "log" | "error", run: () => Promise<void>): Promise<string[]> {
  const messages: string[] = [];
  const original = console[method];
  console[method] = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  try {
    await run();
  } finally {
    console[method] = original;
  }
  return messages;
}

test("the scheduled cleanup deletes only old photos that no meal links to", async () => {
  const linkedKey = "meals/linked/original";
  const orphanKey = "meals/orphan/original";
  const deleted: string[] = [];
  const bucket = bucketWith([
    { key: linkedKey, uploaded: new Date(0) },
    { key: orphanKey, uploaded: new Date(0) },
    { key: "meals/recent/original", uploaded: new Date() },
  ], deleted);

  const messages = await captureConsole("log", () => runScheduledPhotoCleanup({ DB: databaseLinking([linkedKey]), PHOTOS: bucket }));

  assert.deepEqual(deleted, [orphanKey]);
  assert.deepEqual(JSON.parse(messages[0] ?? "{}"), {
    event: "meal_photo_cleanup",
    pages: 1,
    inspected: 3,
    skippedRecent: 1,
    skippedLinked: 1,
    skippedInvalid: 0,
    deleted: 1,
    truncated: false,
  });
});

test("a failed cleanup logs a fixed error without the failure's details", async () => {
  const bucket = bucketWith([], []);
  bucket.list = async () => {
    throw new Error("private_cleanup_detail");
  };

  const messages = await captureConsole("error", () => runScheduledPhotoCleanup({ DB: {} as D1Database, PHOTOS: bucket }));

  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(messages[0] ?? "{}"), { event: "meal_photo_cleanup_error", code: "cleanup_failed" });
});

test("the built Worker handles the cron trigger and has no queue consumer", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href) as {
    default: { scheduled?: (controller: unknown, env: unknown, ctx: unknown) => Promise<void>; queue?: unknown };
  };
  assert.equal(typeof worker.scheduled, "function");
  assert.equal("queue" in worker, false);

  const deleted: string[] = [];
  const bucket = bucketWith([{ key: "meals/orphan/original", uploaded: new Date(0) }], deleted);
  await captureConsole("log", async () => {
    await worker.scheduled?.({}, { DB: databaseLinking([]), PHOTOS: bucket }, { waitUntil() {}, passThroughOnException() {} });
  });
  assert.deepEqual(deleted, ["meals/orphan/original"]);
});
