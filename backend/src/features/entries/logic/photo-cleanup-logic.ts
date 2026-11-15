import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";
import type { PhotoListing } from "../storage/types.js";
import { PHOTO_PREFIX } from "../utils/meal-photo.js";

type PhotoCleanupProps = BackendLogicProps<
  "entries" | "entriesPhotos",
  "clock" | "logger"
>;

/** An object this young may belong to an upload that has not saved its entry yet. */
const ORPHAN_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
const MIN_GRACE_PERIOD_MS = 60 * 60 * 1000;
const MAX_PAGE_SIZE = 100;
const MAX_PAGES = 10;

export interface PhotoCleanupResult {
  pages: number;
  inspected: number;
  skippedRecent: number;
  skippedLinked: number;
  skippedInvalid: number;
  deleted: number;
  truncated: boolean;
}

function boundedInteger({
  value,
  fallback,
  max,
}: {
  value: number | undefined;
  fallback: number;
  max: number;
}): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, Math.floor(value)));
}

/** Removes photo objects that no entry uses, in bounded runs of the schedule. */
export class PhotoCleanupLogic extends Logic<
  PhotoCleanupProps,
  Record<string, never>
> {
  constructor(deps: PhotoCleanupProps) {
    super({ deps, initialState: {} });
  }

  /** The hourly run. A failure is logged without its details, and the next run tries again. */
  async runScheduled(): Promise<void> {
    const { logger } = this.deps.services;
    try {
      logger.info("meal_photo_cleanup", { ...(await this.cleanUp({})) });
    } catch {
      logger.error("meal_photo_cleanup_error", { code: "cleanup_failed" });
    }
  }

  /**
   * Delete only old objects with no entry. The listing is bounded. The place
   * of the run is saved in the bucket, so that the next run goes on from
   * there. A missing, damaged or stale place sends the run back to the start,
   * which is safe: an object in use is always skipped, and a second delete of
   * a key does nothing.
   */
  async cleanUp({
    gracePeriodMs,
    pageSize,
    maxPages,
  }: {
    gracePeriodMs?: number | undefined;
    pageSize?: number | undefined;
    maxPages?: number | undefined;
  }): Promise<PhotoCleanupResult> {
    const { storage, services } = this.deps;
    const nowMs = services.clock.now();
    const grace = Math.max(
      MIN_GRACE_PERIOD_MS,
      gracePeriodMs ?? ORPHAN_GRACE_PERIOD_MS,
    );
    const limit = boundedInteger({
      value: pageSize,
      fallback: MAX_PAGE_SIZE,
      max: MAX_PAGE_SIZE,
    });
    const pageLimit = boundedInteger({
      value: maxPages,
      fallback: MAX_PAGES,
      max: MAX_PAGES,
    });

    let cursor = await storage.entriesPhotos.loadCleanupCursor();
    let restarted = false;
    const result: PhotoCleanupResult = {
      pages: 0,
      inspected: 0,
      skippedRecent: 0,
      skippedLinked: 0,
      skippedInvalid: 0,
      deleted: 0,
      truncated: false,
    };

    while (result.pages < pageLimit) {
      let listing: PhotoListing;
      try {
        listing = await storage.entriesPhotos.list({
          prefix: PHOTO_PREFIX,
          limit,
          cursor,
        });
      } catch (error) {
        if (cursor && !restarted) {
          // A saved place may no longer be accepted. Start again instead of skipping objects.
          cursor = undefined;
          restarted = true;
          continue;
        }
        throw error;
      }
      if (
        listing.truncated &&
        cursor &&
        listing.cursor === cursor &&
        !restarted
      ) {
        // The same token again cannot make progress.
        cursor = undefined;
        restarted = true;
        continue;
      }

      result.pages += 1;
      result.truncated = listing.truncated;
      result.inspected += listing.objects.length;

      const candidates: string[] = [];
      for (const { key, uploaded } of listing.objects) {
        if (
          !key.startsWith(PHOTO_PREFIX) ||
          !Number.isFinite(uploaded.getTime())
        ) {
          result.skippedInvalid += 1;
        } else if (uploaded.getTime() > nowMs - grace) {
          result.skippedRecent += 1;
        } else {
          candidates.push(key);
        }
      }
      const linked = await storage.entries.listLinkedPhotoKeys({
        keys: candidates,
      });
      const orphans = candidates.filter((key) => !linked.has(key));
      result.skippedLinked += candidates.length - orphans.length;
      if (orphans.length > 0) {
        await storage.entriesPhotos.delete(orphans);
        result.deleted += orphans.length;
      }

      if (!listing.truncated) {
        await storage.entriesPhotos.resetCleanupCursor();
        cursor = undefined;
        break;
      }
      if (!listing.cursor || listing.cursor === cursor) {
        break;
      }
      cursor = listing.cursor;
      await storage.entriesPhotos.saveCleanupCursor(cursor);
    }
    return result;
  }
}
