import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupUnlinkedMealPhotos,
  photoCleanupDecision,
  type CleanupBucket,
} from "../workers/ingest/photo-cleanup";
import { storeMealPhoto, type PhotoBucket } from "../workers/ingest/photos";
import type { StoredAnalysisJob } from "../workers/ingest/types";

const CLEANUP_CURSOR_KEY = "__calocount/photo-cleanup-cursor.json";

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

type CleanupTestObject = {
  readonly key: string;
  readonly uploaded: Date;
};

function createCursorCleanupBucket(initialObjects: readonly CleanupTestObject[]) {
  const objects = [...initialObjects];
  const deletedKeys = new Set<string>();
  let cursorPayload: string | null = null;
  let failCursorRead = false;
  let failCursorWrite = false;
  let failDelete = false;
  const listCalls: Array<Record<string, unknown>> = [];
  const deleteCalls: string[][] = [];

  const bucket: CleanupBucket = {
    async list(options) {
      listCalls.push({ ...options });
      if (options?.cursor === "stale") throw new Error("cursor_not_accepted");
      const start = options?.cursor === undefined ? 0 : Number(options.cursor);
      if (!Number.isSafeInteger(start) || start < 0 || start > objects.length) {
        throw new Error("invalid_cursor");
      }
      const limit = options?.limit ?? 100;
      const visible = objects.filter((object, index) => index >= start && !deletedKeys.has(object.key));
      const page = visible.slice(0, limit);
      const lastIndex = page.length === 0
        ? start
        : objects.findIndex((object) => object.key === page.at(-1)?.key) + 1;
      const hasMore = objects.some((object, index) => index >= lastIndex && !deletedKeys.has(object.key));
      return hasMore
        ? { objects: page, truncated: true, cursor: String(lastIndex) }
        : { objects: page, truncated: false };
    },
    async get(key) {
      assert.equal(key, CLEANUP_CURSOR_KEY);
      if (failCursorRead) throw new Error("cursor_read_failed");
      const payload = cursorPayload;
      return payload === null ? null : { text: async () => payload };
    },
    async put(key, value) {
      assert.equal(key, CLEANUP_CURSOR_KEY);
      if (failCursorWrite) throw new Error("cursor_write_failed");
      cursorPayload = value;
    },
    async delete(keys) {
      if (failDelete) throw new Error("delete_failed");
      const values = Array.isArray(keys) ? keys : [keys];
      if (values.includes(CLEANUP_CURSOR_KEY)) cursorPayload = null;
      for (const key of values) {
        if (objects.some((object) => object.key === key)) deletedKeys.add(key);
      }
      const photos = values.filter((key) => key.startsWith("meals/"));
      if (photos.length > 0) deleteCalls.push(photos);
    },
  };

  return {
    bucket,
    listCalls,
    deleteCalls,
    getCursorPayload: () => cursorPayload,
    setCursorPayload: (payload: string | null) => {
      cursorPayload = payload;
    },
    setFailCursorRead: (value: boolean) => {
      failCursorRead = value;
    },
    setFailCursorWrite: (value: boolean) => {
      failCursorWrite = value;
    },
    setFailDelete: (value: boolean) => {
      failDelete = value;
    },
  };
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
  let cursorPayload: string | null = null;
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
      const values = Array.isArray(keys) ? keys : [keys];
      if (values.includes(CLEANUP_CURSOR_KEY)) cursorPayload = null;
      const photos = values.filter((key) => key.startsWith("meals/"));
      if (photos.length > 0) deleteCalls.push(photos);
    },
    async get(key) {
      assert.equal(key, CLEANUP_CURSOR_KEY);
      return cursorPayload === null ? null : { text: async () => cursorPayload! };
    },
    async put(key, value) {
      assert.equal(key, CLEANUP_CURSOR_KEY);
      cursorPayload = value;
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

test("photo cleanup resumes after a bounded run and clears its cursor at the end", async () => {
  const nowMs = 1_800_000_000_000;
  const old = new Date(nowMs - 2 * 24 * 60 * 60 * 1_000);
  const linkedKeys = Array.from({ length: 1_000 }, (_, index) => `meals/linked-${index}/original`);
  const trailingOrphan = "meals/orphan-tail/original";
  const db = new PhotoDatabase();
  for (const key of linkedKeys) db.linkedKeys.add(key);
  const state = createCursorCleanupBucket([
    ...linkedKeys.map((key) => ({ key, uploaded: old })),
    { key: trailingOrphan, uploaded: old },
  ]);

  const first = await cleanupUnlinkedMealPhotos({
    bucket: state.bucket,
    db: db as D1Database,
    nowMs,
  });

  assert.equal(first.pages, 10);
  assert.equal(first.inspected, 1_000);
  assert.equal(first.skippedLinked, 1_000);
  assert.equal(first.deleted, 0);
  assert.equal(first.truncated, true);
  assert.equal(state.listCalls[0]?.cursor, undefined);
  assert.equal(state.listCalls.at(-1)?.cursor, "900");
  assert.deepEqual(JSON.parse(state.getCursorPayload() ?? "null"), {
    version: 1,
    cursor: "1000",
  });

  const second = await cleanupUnlinkedMealPhotos({
    bucket: state.bucket,
    db: db as D1Database,
    nowMs,
  });

  assert.equal(second.pages, 1);
  assert.equal(second.inspected, 1);
  assert.equal(second.deleted, 1);
  assert.equal(second.truncated, false);
  assert.equal(state.listCalls.at(-1)?.cursor, "1000");
  assert.equal(state.getCursorPayload(), null);
  assert.deepEqual(state.deleteCalls, [[trailingOrphan]]);
});

test("photo cleanup restarts safely for malformed or stale cursors", async () => {
  const nowMs = 1_800_000_000_000;
  const old = new Date(nowMs - 2 * 24 * 60 * 60 * 1_000);
  const db = new PhotoDatabase();
  const stale = createCursorCleanupBucket([{ key: "meals/stale-orphan/original", uploaded: old }]);
  stale.setCursorPayload(JSON.stringify({ version: 1, cursor: "stale" }));

  const staleResult = await cleanupUnlinkedMealPhotos({
    bucket: stale.bucket,
    db: db as D1Database,
    nowMs,
  });

  assert.equal(stale.listCalls[0]?.cursor, "stale");
  assert.equal(stale.listCalls[1]?.cursor, undefined);
  assert.equal(staleResult.deleted, 1);
  assert.equal(stale.getCursorPayload(), null);

  const malformed = createCursorCleanupBucket([{ key: "meals/malformed-orphan/original", uploaded: old }]);
  malformed.setCursorPayload("not-json");
  const malformedResult = await cleanupUnlinkedMealPhotos({
    bucket: malformed.bucket,
    db: db as D1Database,
    nowMs,
  });

  assert.equal(malformed.listCalls[0]?.cursor, undefined);
  assert.equal(malformedResult.deleted, 1);
  assert.equal(malformed.getCursorPayload(), null);

  const unreadable = createCursorCleanupBucket([{ key: "meals/unreadable-orphan/original", uploaded: old }]);
  unreadable.setFailCursorRead(true);
  const unreadableResult = await cleanupUnlinkedMealPhotos({
    bucket: unreadable.bucket,
    db: db as D1Database,
    nowMs,
  });

  assert.equal(unreadable.listCalls[0]?.cursor, undefined);
  assert.equal(unreadableResult.deleted, 1);
});

test("photo cleanup retries from a safe position when cursor persistence fails", async () => {
  const nowMs = 1_800_000_000_000;
  const old = new Date(nowMs - 2 * 24 * 60 * 60 * 1_000);
  const db = new PhotoDatabase();
  const state = createCursorCleanupBucket(
    Array.from({ length: 101 }, (_, index) => ({
      key: `meals/write-failure-${index}/original`,
      uploaded: old,
    })),
  );
  state.setFailCursorWrite(true);

  await assert.rejects(
    cleanupUnlinkedMealPhotos({ bucket: state.bucket, db: db as D1Database, nowMs }),
    /cursor_write_failed/,
  );
  assert.equal(state.getCursorPayload(), null);

  state.setFailCursorWrite(false);
  const retry = await cleanupUnlinkedMealPhotos({
    bucket: state.bucket,
    db: db as D1Database,
    nowMs,
  });

  assert.equal(state.listCalls.at(-1)?.cursor, undefined);
  assert.equal(retry.pages, 1);
  assert.equal(retry.inspected, 1);
  assert.equal(retry.deleted, 1);
  assert.equal(state.getCursorPayload(), null);
});

test("photo cleanup keeps its cursor when deletion fails and retries linked-safe pages", async () => {
  const nowMs = 1_800_000_000_000;
  const old = new Date(nowMs - 2 * 24 * 60 * 60 * 1_000);
  const linked = "meals/linked-retained/original";
  const orphan = "meals/delete-retry/original";
  const trailing = "meals/delete-retry-tail/original";
  const db = new PhotoDatabase();
  db.linkedKeys.add(linked);
  const state = createCursorCleanupBucket([
    { key: linked, uploaded: old },
    { key: orphan, uploaded: old },
    { key: trailing, uploaded: old },
  ]);
  state.setCursorPayload(JSON.stringify({ version: 1, cursor: "0" }));
  state.setFailDelete(true);

  await assert.rejects(
    cleanupUnlinkedMealPhotos({
      bucket: state.bucket,
      db: db as D1Database,
      nowMs,
      pageSize: 2,
      maxPages: 1,
    }),
    /delete_failed/,
  );
  assert.deepEqual(JSON.parse(state.getCursorPayload() ?? "null"), {
    version: 1,
    cursor: "0",
  });
  assert.equal(state.deleteCalls.length, 0);

  state.setFailDelete(false);
  const retry = await cleanupUnlinkedMealPhotos({
    bucket: state.bucket,
    db: db as D1Database,
    nowMs,
    pageSize: 2,
    maxPages: 1,
  });
  assert.equal(retry.deleted, 1);
  assert.equal(retry.skippedLinked, 1);
  assert.equal(retry.truncated, true);
  assert.deepEqual(JSON.parse(state.getCursorPayload() ?? "null"), {
    version: 1,
    cursor: "2",
  });

  const final = await cleanupUnlinkedMealPhotos({
    bucket: state.bucket,
    db: db as D1Database,
    nowMs,
    pageSize: 2,
    maxPages: 1,
  });
  assert.equal(final.deleted, 1);
  assert.equal(state.getCursorPayload(), null);
  assert.deepEqual(state.deleteCalls, [[orphan], [trailing]]);
  assert.ok(!state.deleteCalls.flat().includes(linked));
});
