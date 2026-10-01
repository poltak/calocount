import { cleanupUnlinkedMealPhotos, type CleanupBucket } from "./photo-cleanup";

export type ScheduledEnvironment = {
  readonly DB: D1Database;
  readonly PHOTOS: CleanupBucket;
};

/** Remove old photos that no meal links to. A failure is logged without its details. */
export async function runScheduledPhotoCleanup(env: ScheduledEnvironment): Promise<void> {
  try {
    const cleanup = await cleanupUnlinkedMealPhotos({
      bucket: env.PHOTOS,
      db: env.DB,
    });
    console.log(JSON.stringify({ event: "meal_photo_cleanup", ...cleanup }));
  } catch {
    console.error(JSON.stringify({ event: "meal_photo_cleanup_error", code: "cleanup_failed" }));
  }
}
