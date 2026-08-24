import { persistMealPhoto, type MealPhotoMetadata } from "./jobs";
import type { StoredAnalysisJob } from "./types";

export interface DownloadedMealPhoto {
  readonly body: ReadableStream;
  readonly contentType: string;
}

export interface StoredMealPhoto extends MealPhotoMetadata {
  readonly downloaded: boolean;
}

export interface MealPhotoObject {
  readonly size: number;
  readonly httpMetadata?: {
    readonly contentType?: string;
  };
}

export interface PhotoBucket {
  head(key: string): Promise<MealPhotoObject | null>;
  put(
    key: string,
    value: ReadableStream,
    options?: {
      readonly httpMetadata?: { readonly contentType?: string };
      readonly customMetadata?: Record<string, string>;
    },
  ): Promise<MealPhotoObject>;
}

export interface StoreMealPhotoInput {
  readonly db: D1Database;
  readonly bucket: PhotoBucket;
  readonly job: StoredAnalysisJob;
  readonly download: () => Promise<DownloadedMealPhoto>;
}

function photoKeyForJob(job: StoredAnalysisJob): string {
  return job.photoKey ?? `meals/${job.id}/original`;
}

function contentTypeFromObject(object: MealPhotoObject, fallback: string | null): string {
  return fallback?.trim() || object.httpMetadata?.contentType?.trim() || "image/jpeg";
}

/**
 * Make sure the Telegram photo is in R2 and linked in D1 before analysis.
 * Retries reuse an existing object when possible, so an AI failure does not
 * require downloading the Telegram file again.
 */
export async function storeMealPhoto(input: StoreMealPhotoInput): Promise<StoredMealPhoto> {
  const key = photoKeyForJob(input.job);

  if (input.job.photoKey) {
    const existing = await input.bucket.head(key);
    if (existing) {
      const photo = {
        photoKey: key,
        photoMimeType: contentTypeFromObject(existing, input.job.photoMimeType),
        photoSizeBytes: existing.size,
      } satisfies MealPhotoMetadata;
      await persistMealPhoto(input.db, input.job, photo);
      return { ...photo, downloaded: false };
    }
  }

  const downloaded = await input.download();
  const stored = await input.bucket.put(key, downloaded.body, {
    httpMetadata: { contentType: downloaded.contentType },
    customMetadata: { jobId: input.job.id },
  });
  const photo = {
    photoKey: key,
    photoMimeType: downloaded.contentType,
    photoSizeBytes: stored.size,
  } satisfies MealPhotoMetadata;
  await persistMealPhoto(input.db, input.job, photo);
  return { ...photo, downloaded: true };
}
