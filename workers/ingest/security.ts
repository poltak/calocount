import type { TelegramWebhookEnvironment } from "./types";

const textEncoder = new TextEncoder();
const COMPARISON_KEY = textEncoder.encode("calocount-webhook-comparison-key");

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    return null;
  }

  const padding = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + padding;

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Compare secrets through Web Crypto verification. This avoids a direct
 * string comparison for the webhook token.
 */
export async function timingSafeEqual(expected: string, actual: string): Promise<boolean> {
  if (expected.length === 0 || actual.length === 0) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    COMPARISON_KEY,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(actual));
  return crypto.subtle.verify("HMAC", key, signature, textEncoder.encode(expected));
}

export async function isAuthorizedWebhookRequest(
  request: Request,
  environment: TelegramWebhookEnvironment,
): Promise<boolean> {
  const expected = environment.TELEGRAM_WEBHOOK_SECRET;
  const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!expected || !actual) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

export function normalizeTelegramId(value: unknown): string | null {
  if (typeof value === "string" && /^-?\d+$/u.test(value)) {
    return value;
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value);
  }

  return null;
}

export function parseExactAllowlist(value: string | undefined): ReadonlySet<string> {
  if (!value) {
    return new Set<string>();
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => /^-?\d+$/u.test(entry));
  return new Set(entries);
}

export interface TelegramAllowlistUpdate {
  readonly fromId: unknown;
  readonly chatId: unknown;
}

/**
 * Require both the Telegram sender and chat to be explicitly allowlisted.
 * Empty allowlists fail closed.
 */
export function isAllowedTelegramUpdate(
  update: TelegramAllowlistUpdate,
  environment: TelegramWebhookEnvironment,
): boolean {
  const userId = normalizeTelegramId(update.fromId);
  const chatId = normalizeTelegramId(update.chatId);
  if (!userId || !chatId) {
    return false;
  }

  const allowedUsers = parseExactAllowlist(
    environment.TELEGRAM_ALLOWED_USER_IDS ?? environment.TELEGRAM_ALLOWED_USER_ID,
  );
  const allowedChats = parseExactAllowlist(
    environment.TELEGRAM_ALLOWED_CHAT_IDS ?? environment.TELEGRAM_ALLOWED_CHAT_ID,
  );
  return allowedUsers.has(userId) && allowedChats.has(chatId);
}

interface MediaTokenPayload {
  readonly key: string;
  readonly expiresAt: number;
  readonly nonce: string;
}

export async function createMediaToken(
  key: string,
  secret: string,
  nowMs = Date.now(),
  ttlSeconds = 300,
): Promise<string> {
  if (!key || !secret || !Number.isFinite(nowMs) || !Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Invalid media token input");
  }

  const payload: MediaTokenPayload = {
    key,
    expiresAt: Math.floor(nowMs / 1000) + ttlSeconds,
    nonce: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
  const encodedPayload = bytesToBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const hmacKey = await importHmacKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmacKey, textEncoder.encode(encodedPayload)),
  );
  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

export async function verifyMediaToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): Promise<{ readonly key: string; readonly expiresAt: number; readonly nonce: string } | null> {
  if (!token || !secret || !Number.isFinite(nowMs)) {
    return null;
  }

  const separator = token.lastIndexOf(".");
  if (separator <= 0 || separator === token.length - 1) {
    return null;
  }

  const encodedPayload = token.slice(0, separator);
  const encodedSignature = token.slice(separator + 1);
  const signature = base64UrlToBytes(encodedSignature);
  if (!signature) {
    return null;
  }

  const hmacKey = await importHmacKey(secret);
  const signatureBuffer = signature.buffer as ArrayBuffer;
  const valid = await crypto.subtle.verify(
    "HMAC",
    hmacKey,
    signatureBuffer,
    textEncoder.encode(encodedPayload),
  );
  if (!valid) {
    return null;
  }

  const payloadBytes = base64UrlToBytes(encodedPayload);
  if (!payloadBytes) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as unknown;
  } catch {
    return null;
  }

  if (!isMediaTokenPayload(parsed)) {
    return null;
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  if (parsed.expiresAt <= nowSeconds) {
    return null;
  }

  return parsed;
}

function isMediaTokenPayload(value: unknown): value is MediaTokenPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 3 || keys.join(",") !== "expiresAt,key,nonce") {
    return false;
  }
  return (
    typeof record.key === "string" &&
    record.key.length > 0 &&
    record.key.length <= 512 &&
    typeof record.expiresAt === "number" &&
    Number.isSafeInteger(record.expiresAt) &&
    typeof record.nonce === "string" &&
    /^[A-Za-z0-9_-]{22}$/u.test(record.nonce)
  );
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message.slice(0, 200);
  }
  return "unknown_error";
}
