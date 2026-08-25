const SHARE_TOKEN_BYTE_LENGTH = 32;
export const SHARE_TOKEN_LENGTH = 43;
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isValidShareToken(value: unknown): value is string {
  return typeof value === "string"
    && value.length === SHARE_TOKEN_LENGTH
    && SHARE_TOKEN_PATTERN.test(value);
}

/** Generate a 256-bit opaque token. The raw value must only be returned once. */
export function generateShareToken(): string {
  const bytes = new Uint8Array(SHARE_TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** Hash a token before it is stored or used in a database query. */
export async function hashShareToken(token: string): Promise<string> {
  if (!isValidShareToken(token)) throw new Error("invalid_share_token");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}
