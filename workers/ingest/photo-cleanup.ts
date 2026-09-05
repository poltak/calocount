const PHOTO_PREFIX = "meals/";
const PHOTO_CLEANUP_CURSOR_KEY = "__calocount/photo-cleanup-cursor.json";
const PHOTO_CLEANUP_CURSOR_VERSION = 1;
export const PHOTO_ORPHAN_GRACE_PERIOD_MS = 24 * 60 * 60 * 1_000;
const MAX_LIST_PAGE_SIZE = 100;
const MAX_LIST_PAGES = 10;

export interface PhotoCleanupObject {
  readonly key: string;
  readonly uploaded: Date;
}

export interface PhotoCleanupListing {
  readonly objects: readonly PhotoCleanupObject[];
  readonly truncated: boolean;
  readonly cursor?: string;
}

export interface CleanupBucket {
  list(options?: {
    readonly prefix?: string;
    readonly limit?: number;
    readonly cursor?: string;
  }): Promise<PhotoCleanupListing>;
  delete(keys: string | string[]): Promise<void>;
  /** R2 object access for the small durable scan cursor. */
  get(key: string): Promise<{
    text(): Promise<string>;
  } | null>;
  put(key: string, value: string, options?: {
    readonly httpMetadata?: { readonly contentType?: string };
  }): Promise<unknown>;
}

export interface PhotoCleanupInput {
  readonly bucket: CleanupBucket;
  readonly db: D1Database;
  readonly nowMs?: number;
  readonly gracePeriodMs?: number;
  readonly pageSize?: number;
  readonly maxPages?: number;
}

export interface PhotoCleanupResult {
  readonly pages: number;
  readonly inspected: number;
  readonly skippedRecent: number;
  readonly skippedLinked: number;
  readonly skippedInvalid: number;
  readonly deleted: number;
  readonly truncated: boolean;
}

export interface PhotoCleanupDecisionInput {
  readonly key: string;
  readonly uploadedAtMs: number;
  readonly nowMs: number;
  readonly gracePeriodMs: number;
  readonly linked: boolean;
}

export type PhotoCleanupDecision = "delete" | "linked" | "recent" | "invalid";

export function photoCleanupDecision(input: PhotoCleanupDecisionInput): PhotoCleanupDecision {
  if (!input.key.startsWith(PHOTO_PREFIX) || !Number.isFinite(input.uploadedAtMs)) {
    return "invalid";
  }
  if (input.linked) return "linked";
  if (input.uploadedAtMs > input.nowMs - input.gracePeriodMs) return "recent";
  return "delete";
}

function boundedInteger(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

async function linkedPhotoKeys(db: D1Database, keys: readonly string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const placeholders = keys.map(() => "?").join(", ");
  const result = await db
    .prepare(`SELECT photo_key FROM meal_logs WHERE photo_key IN (${placeholders})`)
    .bind(...keys)
    .all<{ readonly photo_key: string | null }>();
  return new Set(
    result.results
      .map((row) => row.photo_key)
      .filter((key): key is string => typeof key === "string" && key.length > 0),
  );
}

function validCursor(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function loadCleanupCursor(bucket: CleanupBucket): Promise<string | undefined> {
  try {
    const object = await bucket.get(PHOTO_CLEANUP_CURSOR_KEY);
    if (!object) return undefined;
    const parsed = JSON.parse(await object.text()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const state = parsed as { readonly version?: unknown; readonly cursor?: unknown };
    return state.version === PHOTO_CLEANUP_CURSOR_VERSION && validCursor(state.cursor)
      ? state.cursor
      : undefined;
  } catch {
    // A missing, unreadable, or malformed cursor must never block cleanup.
    return undefined;
  }
}

async function saveCleanupCursor(bucket: CleanupBucket, cursor: string): Promise<void> {
  await bucket.put(PHOTO_CLEANUP_CURSOR_KEY, JSON.stringify({
    version: PHOTO_CLEANUP_CURSOR_VERSION,
    cursor,
  }), {
    httpMetadata: { contentType: "application/json" },
  });
}

async function resetCleanupCursor(bucket: CleanupBucket): Promise<void> {
  await bucket.delete(PHOTO_CLEANUP_CURSOR_KEY);
}

/**
 * Delete only old, unlinked objects from the meal-photo namespace.
 *
 * Listing is deliberately bounded. A small cursor object in the same private
 * bucket lets a later cron run continue where the previous run stopped. A
 * missing, malformed, or stale cursor falls back to the beginning, which is
 * safe because linked objects are always skipped and deletes are idempotent.
 */
export async function cleanupUnlinkedMealPhotos(input: PhotoCleanupInput): Promise<PhotoCleanupResult> {
  const nowMs = input.nowMs ?? Date.now();
  const gracePeriodMs = Math.max(60 * 60 * 1_000, input.gracePeriodMs ?? PHOTO_ORPHAN_GRACE_PERIOD_MS);
  const pageSize = boundedInteger(input.pageSize, MAX_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE);
  const maxPages = boundedInteger(input.maxPages, MAX_LIST_PAGES, MAX_LIST_PAGES);

  let cursor = await loadCleanupCursor(input.bucket);
  let restartedFromCursor = false;
  let pages = 0;
  let inspected = 0;
  let skippedRecent = 0;
  let skippedLinked = 0;
  let skippedInvalid = 0;
  let deleted = 0;
  let truncated = false;

  while (pages < maxPages) {
    let listing: PhotoCleanupListing;
    try {
      listing = await input.bucket.list({
        prefix: PHOTO_PREFIX,
        limit: pageSize,
        ...(cursor ? { cursor } : {}),
      });
    } catch (error) {
      if (cursor && !restartedFromCursor) {
        // A saved cursor may no longer be accepted. Restart once instead of skipping objects.
        cursor = undefined;
        restartedFromCursor = true;
        continue;
      }
      throw error;
    }

    if (listing.truncated && listing.cursor === cursor && cursor && !restartedFromCursor) {
      // A provider returning the same continuation token cannot make progress.
      cursor = undefined;
      restartedFromCursor = true;
      continue;
    }

    pages += 1;
    truncated = listing.truncated;
    inspected += listing.objects.length;

    const candidates = listing.objects.filter((object) => (
      photoCleanupDecision({
        key: object.key,
        uploadedAtMs: object.uploaded.getTime(),
        nowMs,
        gracePeriodMs,
        linked: false,
      }) === "delete"
    ));
    skippedInvalid += listing.objects.filter((object) => (
      photoCleanupDecision({
        key: object.key,
        uploadedAtMs: object.uploaded.getTime(),
        nowMs,
        gracePeriodMs,
        linked: false,
      }) === "invalid"
    )).length;
    skippedRecent += listing.objects.filter((object) => (
      photoCleanupDecision({
        key: object.key,
        uploadedAtMs: object.uploaded.getTime(),
        nowMs,
        gracePeriodMs,
        linked: false,
      }) === "recent"
    )).length;

    const linked = await linkedPhotoKeys(input.db, candidates.map((object) => object.key));
    const orphanKeys = candidates
      .map((object) => object.key)
      .filter((key) => {
        const isLinked = linked.has(key);
        if (isLinked) skippedLinked += 1;
        return !isLinked;
      });
    if (orphanKeys.length > 0) {
      await input.bucket.delete(orphanKeys);
      deleted += orphanKeys.length;
    }

    if (!listing.truncated) {
      await resetCleanupCursor(input.bucket);
      cursor = undefined;
      break;
    }
    if (!listing.cursor || listing.cursor === cursor) break;
    cursor = listing.cursor;
    await saveCleanupCursor(input.bucket, cursor);
  }

  return {
    pages,
    inspected,
    skippedRecent,
    skippedLinked,
    skippedInvalid,
    deleted,
    truncated,
  };
}
