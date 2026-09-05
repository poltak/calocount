import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { ingestWorker } from "../workers/ingest/index";
import { claimAnalysisJob, findStaleAnalysisJobs, resetStaleAnalysisJob } from "../workers/ingest/jobs";
import type { IngestEnvironment } from "../workers/ingest/types";

function recoveryDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE analysis_jobs (
    id TEXT PRIMARY KEY, state TEXT, attempt_count INTEGER DEFAULT 0,
    available_after INTEGER, updated_at INTEGER,
    last_error_code TEXT, last_error_message TEXT
  )`);
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: Array<string | number>) {
          return {
            async all() {
              return { results: sqlite.prepare(sql).all(...values) };
            },
            async run() {
              return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { sqlite, db };
}

test("cron redelivers a recovery job after a queue failure and claims it only once", async (t) => {
  const { sqlite, db } = recoveryDatabase();
  t.after(() => sqlite.close());
  const now = Date.now();
  const old = now - 30 * 60_000;
  const insert = sqlite.prepare("INSERT INTO analysis_jobs (id, state, available_after, updated_at) VALUES (?, ?, ?, ?)");
  insert.run("stale", "processing", old, old);
  const deliveries: string[] = [];
  let failDelivery = true;
  let cursorPayload: string | null = null;
  const env = {
    DB: db,
    MEAL_QUEUE: {
      async send(body: { jobId: string }) {
        if (failDelivery) throw new Error("queue unavailable");
        deliveries.push(body.jobId);
      },
    },
    MEAL_PHOTOS: {
      async list() { return { objects: [], truncated: false }; },
      async get(key: string) {
        assert.match(key, /photo-cleanup-cursor\.json$/);
        return cursorPayload === null ? null : { text: async () => cursorPayload! };
      },
      async put(key: string, value: string) {
        assert.match(key, /photo-cleanup-cursor\.json$/);
        cursorPayload = value;
        return null;
      },
      async delete(keys: string | string[]) {
        const values = Array.isArray(keys) ? keys : [keys];
        if (values.some((key) => key.endsWith("photo-cleanup-cursor.json"))) cursorPayload = null;
      },
    },
  } as unknown as IngestEnvironment;

  await ingestWorker.scheduled({} as ScheduledController, env, {} as ExecutionContext);
  assert.equal(sqlite.prepare("SELECT state FROM analysis_jobs WHERE id = 'stale'").get()?.state, "retry");
  assert.deepEqual(deliveries, []);

  // Advance the stored age past the next recovery window without a real wait.
  sqlite.prepare("UPDATE analysis_jobs SET updated_at = ? WHERE id = 'stale'").run(old);
  failDelivery = false;
  await ingestWorker.scheduled({} as ScheduledController, env, {} as ExecutionContext);
  assert.deepEqual(deliveries, ["stale"]);
  assert.equal(await claimAnalysisJob(db, "stale"), true);
  assert.equal(await claimAnalysisJob(db, "stale"), false);
});

test("recovery selects old due jobs and leaves backoff and active claims intact", async (t) => {
  const { sqlite, db } = recoveryDatabase();
  t.after(() => sqlite.close());
  const now = Date.now();
  const old = now - 30 * 60_000;
  const insert = sqlite.prepare("INSERT INTO analysis_jobs (id, state, available_after, updated_at) VALUES (?, ?, ?, ?)");
  insert.run("pending", "pending", old, old);
  insert.run("retry", "retry", old, old);
  insert.run("backoff", "retry", now + 60_000, old);
  insert.run("active", "processing", old, now);
  insert.run("fresh", "pending", old, now);
  insert.run("complete", "complete", old, old);
  insert.run("failed", "failed", old, old);

  assert.deepEqual([...(await findStaleAnalysisJobs(db))].sort(), ["pending", "retry"]);
  await resetStaleAnalysisJob(db, "backoff");
  assert.equal(sqlite.prepare("SELECT available_after FROM analysis_jobs WHERE id = 'backoff'").get()?.available_after, now + 60_000);

  // A queued duplicate can claim the row after cron selects it. Cron must
  // not reset that fresh claim and permit another concurrent analysis.
  assert.equal(await claimAnalysisJob(db, "retry"), true);
  await resetStaleAnalysisJob(db, "retry");
  assert.equal(await claimAnalysisJob(db, "retry"), false);
});
