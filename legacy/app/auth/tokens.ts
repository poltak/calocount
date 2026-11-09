/** Random values and hashes for sessions, setup codes and OAuth. */

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A random value with `bytes` bytes of entropy, as base64url. */
export function randomToken(bytes = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function sha256Hex(value: string): Promise<string> {
  return Array.from(await sha256(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Base64Url(value: string): Promise<string> {
  return base64UrlEncode(await sha256(value));
}

/** Compare two secrets without leaking where they differ. Both are hashed first, so their lengths do not leak either. */
export async function secretsEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(left), sha256(right)]);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/**
 * A key for the network of a request, for rate limits. Cloudflare sets
 * CF-Connecting-IP. The database keeps only a hash of it.
 */
export async function networkKey(request: Request): Promise<string> {
  return (await sha256Hex(`calocount-network:${request.headers.get("cf-connecting-ip") ?? "unknown"}`)).slice(0, 32);
}
