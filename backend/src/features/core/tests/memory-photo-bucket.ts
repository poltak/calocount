import type {
  PhotoBucket,
  PhotoListing,
  PhotoObject,
} from "../../entries/storage/types.js";

interface StoredObject {
  bytes: Uint8Array;
  contentType: string | undefined;
  uploaded: Date;
  etag: string;
}

type Operation = "put" | "delete" | "list";

/**
 * A photo bucket in memory, in place of R2. A test can age an object, and
 * make the next operation fail, as a bucket does when R2 has an outage.
 */
export class MemoryPhotoBucket implements PhotoBucket {
  private readonly objects = new Map<string, StoredObject>();
  private readonly failures: Operation[] = [];
  private readonly issuedCursors = new Set<string>();
  private writes = 0;

  /** The keys of the bucket, in order. */
  keys(): string[] {
    return [...this.objects.keys()].toSorted();
  }

  /** The bytes and the type of an object, or `undefined`. */
  read(
    key: string,
  ): { bytes: Uint8Array; contentType: string | undefined } | undefined {
    const stored = this.objects.get(key);
    return stored && { bytes: stored.bytes, contentType: stored.contentType };
  }

  /** Put an object as if it was uploaded at `uploaded`. */
  seed({
    key,
    uploaded,
    bytes = new Uint8Array([1]),
  }: {
    key: string;
    uploaded: Date;
    bytes?: Uint8Array;
  }): void {
    this.objects.set(key, {
      bytes,
      contentType: "image/png",
      uploaded,
      etag: this.nextEtag(),
    });
  }

  /** Make the next operation of this kind fail. Call it again for the next one. */
  failNext(operation: Operation): void {
    this.failures.push(operation);
  }

  private nextEtag(): string {
    this.writes += 1;
    return `"etag-${this.writes}"`;
  }

  private checkFailure(operation: Operation): void {
    const index = this.failures.indexOf(operation);
    if (index !== -1) {
      this.failures.splice(index, 1);
      throw new Error(`The bucket failed to ${operation}`);
    }
  }

  put(
    key: string,
    value: ArrayBuffer | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<{ size: number }> {
    try {
      this.checkFailure("put");
    } catch (error) {
      return Promise.reject(error as Error);
    }
    const bytes =
      typeof value === "string"
        ? new TextEncoder().encode(value)
        : new Uint8Array(value.slice(0));
    this.objects.set(key, {
      bytes,
      contentType: options?.httpMetadata?.contentType,
      // The time of the machine: a test that needs another time uses `seed`.
      uploaded: new Date(),
      etag: this.nextEtag(),
    });
    return Promise.resolve({ size: bytes.byteLength });
  }

  get(
    key: string,
  ): Promise<(PhotoObject & { text(): Promise<string> }) | null> {
    const stored = this.objects.get(key);
    if (!stored) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(stored.bytes);
          controller.close();
        },
      }),
      httpEtag: stored.etag,
      size: stored.bytes.byteLength,
      httpMetadata: { contentType: stored.contentType },
      text: () => Promise.resolve(new TextDecoder().decode(stored.bytes)),
    });
  }

  head(key: string): Promise<{ httpEtag: string } | null> {
    const stored = this.objects.get(key);
    return Promise.resolve(stored ? { httpEtag: stored.etag } : null);
  }

  delete(keys: string | string[]): Promise<void> {
    try {
      this.checkFailure("delete");
    } catch (error) {
      return Promise.reject(error as Error);
    }
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      this.objects.delete(key);
    }
    return Promise.resolve();
  }

  list({
    prefix,
    limit,
    cursor,
  }: {
    prefix: string;
    limit: number;
    cursor?: string;
  }): Promise<PhotoListing> {
    try {
      this.checkFailure("list");
    } catch (error) {
      return Promise.reject(error as Error);
    }
    if (cursor !== undefined && !this.issuedCursors.has(cursor)) {
      return Promise.reject(new Error("The cursor is not valid"));
    }
    const keys = this.keys().filter(
      (key) => key.startsWith(prefix) && (cursor === undefined || key > cursor),
    );
    const page = keys.slice(0, limit);
    const truncated = keys.length > limit;
    const next = truncated ? page.at(-1) : undefined;
    if (next !== undefined) {
      this.issuedCursors.add(next);
    }
    return Promise.resolve({
      objects: page.flatMap((key) => {
        const stored = this.objects.get(key);
        return stored ? [{ key, uploaded: stored.uploaded }] : [];
      }),
      truncated,
      cursor: next,
    });
  }
}
