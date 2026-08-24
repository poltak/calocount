import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupUnlinkedMealPhotos,
  photoCleanupDecision,
  type CleanupBucket,
} from "../workers/ingest/photo-cleanup";
import { storeMealPhoto, type PhotoBucket } from "../workers/ingest/photos";
import type { StoredAnalysisJob } from "../workers/ingest/types";

function d1Result<T>(results: T[] = [], changes = 1): D1Result<T> {
  return {
    success: true,
    results,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: changes,
      last_row_id: 0,
      changed_db: changes > 0,
      changes,
    },
  };
}

class PhotoDatabase {
  readonly events: string[] = [];
  readonly linkedKeys = new Set<string>();
  private values: unknown[] = [];

  prepare(sql: string): D1PreparedStatement {
    this.events.push(sql.includes("SELECT photo_key") ? "d1-link-check" : "d1-persist-prepare");
    return new PhotoStatement(this);
  }

  setValues(values: unknown[]): void {
    this.values = values;
  }

  linkedRows(): Array<{ readonly photo_key: string }> {
    return this.values
      .filter((value): value is string => typeof value === "string" && this.linkedKeys.has(value))
      .map((photo_key) => ({ photo_key }));
  }

  batch<T = unknown>(_statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    void _statements;
    return Promise.resolve([]);
  }

  exec(_query: string): Promise<D1ExecResult> {
    void _query;
    return Promise.resolve({ count: 0, duration: 0 });
  }

  withSession(_constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint): D1DatabaseSession {
    void _constraintOrBookmark;
    throw new Error("not used in test");
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }
}

class PhotoStatement {
  constructor(private readonly db: PhotoDatabase) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.db.setValues(values);
    return this;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    this.db.events.push("d1-persist");
    return d1Result<T>();
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return d1Result(this.db.linkedRows() as T[], 0);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return null;
  }

  raw<T = unknown[]>(options: { readonly columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { readonly columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: { readonly columnNames?: boolean }): Promise<[string[], ...T[]] | T[]> {
    return options?.columnNames ? [[]] as [string[], ...T[]] : [] as T[];
  }
}

const baseJob: StoredAnalysisJob = {
  id: "job-1",
  mealId: "meal-1",
  ownerKey: "owner",
  state: "processing",
  attemptCount: 1,
  availableAfter: 0,
  telegramUpdateId: 1,
  telegramUserId: "user",
  telegramFileId: "file",
  telegramChatId: "chat",
  caption: "Yogurt",
  capturedAt: new Date(1_700_000_000_000).toISOString(),
  photoKey: null,
  photoMimeType: null,
};

test("stores the R2 photo and persists its D1 ownership before inference continues", async () => {
  const db = new PhotoDatabase();
  const events = db.events;
  const bucket: PhotoBucket = {
    async head() {
      events.push("r2-head");
      return null;
    },
    async put() {
      events.push("r2-put");
      return { size: 1234 };
    },
  };

  const stored = await storeMealPhoto({
    db: db as D1Database,
    bucket,
    job: baseJob,
    download: async () => {
      events.push("telegram-download");
      return { body: new ReadableStream(), contentType: "image/jpeg" };
    },
  });
  events.push("inference");

  assert.equal(events[0], "telegram-download");
  assert.ok(events.indexOf("r2-put") < events.indexOf("d1-persist"));
  assert.ok(events.indexOf("d1-persist") < events.indexOf("inference"));
  assert.deepEqual(stored, {
    photoKey: "meals/job-1/original",
    photoMimeType: "image/jpeg",
    photoSizeBytes: 1234,
    downloaded: true,
  });
});

test("reuses a persisted R2 photo on retry and retains its metadata", async () => {
  const db = new PhotoDatabase();
  const events = db.events;
  const bucket: PhotoBucket = {
    async head() {
      events.push("r2-head");
      return { size: 42, httpMetadata: { contentType: "image/webp" } };
    },
    async put() {
      events.push("r2-put");
      return { size: 42 };
    },
  };

  const stored = await storeMealPhoto({
    db: db as D1Database,
    bucket,
    job: { ...baseJob, photoKey: "meals/job-1/original", photoMimeType: "image/webp" },
    download: async () => {
      events.push("telegram-download");
      return { body: new ReadableStream(), contentType: "image/webp" };
    },
  });

  assert.equal(events[0], "r2-head");
  assert.equal(events.at(-1), "d1-persist");
  assert.ok(!events.includes("r2-put"));
  assert.ok(!events.includes("telegram-download"));
  assert.equal(stored.photoSizeBytes, 42);
  assert.equal(stored.downloaded, false);
});

test("photo cleanup decisions require an old, unlinked meal object", () => {
  const nowMs = 1_800_000_000_000;
  const gracePeriodMs = 24 * 60 * 60 * 1_000;
  assert.equal(photoCleanupDecision({
    key: "meals/orphan/original",
    uploadedAtMs: nowMs - gracePeriodMs - 1,
    nowMs,
    gracePeriodMs,
    linked: false,
  }), "delete");
  assert.equal(photoCleanupDecision({
    key: "meals/recent/original",
    uploadedAtMs: nowMs - gracePeriodMs + 1,
    nowMs,
    gracePeriodMs,
    linked: false,
  }), "recent");
  assert.equal(photoCleanupDecision({
    key: "meals/linked/original",
    uploadedAtMs: nowMs - gracePeriodMs - 1,
    nowMs,
    gracePeriodMs,
    linked: true,
  }), "linked");
  assert.equal(photoCleanupDecision({
    key: "other/orphan",
    uploadedAtMs: nowMs - gracePeriodMs - 1,
    nowMs,
    gracePeriodMs,
    linked: false,
  }), "invalid");
});

test("photo cleanup paginates R2 and deletes only old unlinked keys", async () => {
  const nowMs = 1_800_000_000_000;
  const old = new Date(nowMs - 2 * 24 * 60 * 60 * 1_000);
  const recent = new Date(nowMs - 60 * 60 * 1_000);
  const db = new PhotoDatabase();
  db.linkedKeys.add("meals/linked/original");
  const listCalls: Array<Record<string, unknown>> = [];
  const deleteCalls: string[][] = [];
  const bucket: CleanupBucket = {
    async list(options) {
      listCalls.push({ ...options });
      if (options?.cursor === "page-2") {
        return {
          objects: [{ key: "meals/orphan-two/original", uploaded: old }],
          truncated: false,
        };
      }
      return {
        objects: [
          { key: "meals/linked/original", uploaded: old },
          { key: "meals/orphan-one/original", uploaded: old },
          { key: "meals/recent/original", uploaded: recent },
        ],
        truncated: true,
        cursor: "page-2",
      };
    },
    async delete(keys) {
      deleteCalls.push(Array.isArray(keys) ? keys : [keys]);
    },
  };

  const result = await cleanupUnlinkedMealPhotos({
    bucket,
    db: db as D1Database,
    nowMs,
  });

  assert.equal(result.pages, 2);
  assert.equal(result.inspected, 4);
  assert.equal(result.skippedRecent, 1);
  assert.equal(result.skippedLinked, 1);
  assert.equal(result.deleted, 2);
  assert.equal(result.truncated, false);
  assert.deepEqual(deleteCalls, [
    ["meals/orphan-one/original"],
    ["meals/orphan-two/original"],
  ]);
  assert.equal(listCalls[0]?.prefix, "meals/");
  assert.equal(listCalls[1]?.cursor, "page-2");
});
