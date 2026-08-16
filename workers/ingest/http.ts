const DEFAULT_MAX_JSON_BYTES = 256 * 1024;

export class BoundedBodyError extends Error {
  constructor(message = "body_too_large") {
    super(message);
    this.name = "BoundedBodyError";
  }
}

interface BodyCarrier {
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
}

function contentLength(response: BodyCarrier): number | null {
  const value = response.headers.get("content-length");
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Read and parse a JSON response without buffering beyond maxBytes. */
export async function readBoundedJson(
  response: BodyCarrier,
  maxBytes = DEFAULT_MAX_JSON_BYTES,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes must be positive");
  }
  const length = contentLength(response);
  if (length !== null && length > maxBytes) {
    throw new BoundedBodyError();
  }

  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let byteCount = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      byteCount += chunk.value.byteLength;
      if (byteCount > maxBytes) {
        await reader.cancel("body_too_large");
        throw new BoundedBodyError();
      }
      chunks.push(decoder.decode(chunk.value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }

  const text = chunks.join("");
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("invalid_json");
  }
}

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
export const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;
export const MAX_TELEGRAM_RESPONSE_BYTES = 64 * 1024;
