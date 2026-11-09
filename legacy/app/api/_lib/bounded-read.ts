/**
 * Read a byte stream into memory with a size cap.
 *
 * Returns null, after cancelling the stream, when it holds more than maxBytes.
 * A read failure or a non-byte chunk rejects; callers map that to their own error.
 */
export async function readBoundedBytes(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) throw new TypeError("The stream produced a non-byte chunk.");
      byteCount += chunk.value.byteLength;
      if (byteCount > maxBytes) {
        // Keep the size result when a source cannot be cancelled cleanly.
        await reader.cancel("payload_too_large").catch(() => undefined);
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
