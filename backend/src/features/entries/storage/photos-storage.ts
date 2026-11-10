import type { PhotoBucket, PhotoListing, PhotoObject } from "./types.js";

/** Where the cleanup keeps its place. The key is outside the photo prefix, so the cleanup never lists it. */
const CURSOR_KEY = "__calocount/photo-cleanup-cursor.json";
const CURSOR_VERSION = 1;

interface PhotosStorageProps {
  bucket: PhotoBucket;
}

/** The photo objects of the entries, in the bucket. */
export class PhotosStorage {
  constructor(private readonly deps: PhotosStorageProps) {}

  async put({
    key,
    bytes,
    contentType,
  }: {
    key: string;
    bytes: ArrayBuffer;
    contentType: string;
  }): Promise<{ size: number | null }> {
    const stored = await this.deps.bucket.put(key, bytes, {
      httpMetadata: { contentType },
    });
    return { size: stored?.size ?? null };
  }

  get(key: string): Promise<PhotoObject | null> {
    return this.deps.bucket.get(key);
  }

  head(key: string): Promise<{ httpEtag: string } | null> {
    return this.deps.bucket.head(key);
  }

  delete(keys: string | string[]): Promise<void> {
    return this.deps.bucket.delete(keys);
  }

  list({
    prefix,
    limit,
    cursor,
  }: {
    prefix: string;
    limit: number;
    cursor: string | undefined;
  }): Promise<PhotoListing> {
    return this.deps.bucket.list({
      prefix,
      limit,
      ...(cursor ? { cursor } : {}),
    });
  }

  /** The saved place of the cleanup. A missing, unreadable or malformed one counts as none. */
  async loadCleanupCursor(): Promise<string | undefined> {
    try {
      const object = await this.deps.bucket.get(CURSOR_KEY);
      if (!object) {
        return undefined;
      }
      const state: unknown = JSON.parse(await object.text());
      if (
        state &&
        typeof state === "object" &&
        "version" in state &&
        "cursor" in state &&
        state.version === CURSOR_VERSION &&
        typeof state.cursor === "string" &&
        state.cursor.length > 0
      ) {
        return state.cursor;
      }
    } catch {
      // A damaged cursor must not stop the cleanup.
    }
    return undefined;
  }

  async saveCleanupCursor(cursor: string): Promise<void> {
    await this.deps.bucket.put(
      CURSOR_KEY,
      JSON.stringify({ version: CURSOR_VERSION, cursor }),
      { httpMetadata: { contentType: "application/json" } },
    );
  }

  async resetCleanupCursor(): Promise<void> {
    await this.deps.bucket.delete(CURSOR_KEY);
  }
}
