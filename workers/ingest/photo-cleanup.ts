const PHOTO_PREFIX = "meals/";
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

/**
 * Delete only old, unlinked objects from the meal-photo namespace.
 *
 * Listing is deliberately bounded. A later cron run continues from the
 * beginning, which is safe because linked objects are always skipped and R2
 * listing is eventually consistent.
 */
export async function cleanupUnlinkedMealPhotos(input: PhotoCleanupInput): Promise<PhotoCleanupResult> {
  const nowMs = input.nowMs ?? Date.now();
  const gracePeriodMs = Math.max(60 * 60 * 1_000, input.gracePeriodMs ?? PHOTO_ORPHAN_GRACE_PERIOD_MS);
  const pageSize = boundedInteger(input.pageSize, MAX_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE);
  const maxPages = boundedInteger(input.maxPages, MAX_LIST_PAGES, MAX_LIST_PAGES);

  let cursor: string | undefined;
  let pages = 0;
  let inspected = 0;
  let skippedRecent = 0;
  let skippedLinked = 0;
  let skippedInvalid = 0;
  let deleted = 0;
  let truncated = false;

  while (pages < maxPages) {
    const listing = await input.bucket.list({
      prefix: PHOTO_PREFIX,
      limit: pageSize,
      ...(cursor ? { cursor } : {}),
    });
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

    if (!listing.truncated || !listing.cursor || listing.cursor === cursor) break;
    cursor = listing.cursor;
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
