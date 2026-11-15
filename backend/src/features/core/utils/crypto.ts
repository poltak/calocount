/** Random values and hashes for sessions, challenges and setup codes. */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** A random value with `bytes` bytes of entropy, as base64url. */
export function randomToken({ bytes = 32 }: { bytes?: number } = {}): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256({ value }: { value: string }): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

export async function sha256Hex({ value }: { value: string }): Promise<string> {
  return Array.from(await sha256({ value }), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function sha256Base64Url({
  value,
}: {
  value: string;
}): Promise<string> {
  return base64UrlEncode(await sha256({ value }));
}

/**
 * Compare two secrets in constant time. Both are hashed first, so the run time
 * does not depend on where they differ or on their lengths.
 */
export async function secretsEqual({
  a,
  b,
}: {
  a: string;
  b: string;
}): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([
    sha256({ value: a }),
    sha256({ value: b }),
  ]);
  let difference = 0;
  for (const [index, byte] of digestA.entries()) {
    difference |= byte ^ (digestB[index] ?? 0);
  }
  return difference === 0;
}
