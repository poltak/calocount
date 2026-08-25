const MAX_JWT_BYTES = 32_768;
const MAX_JWK_RESPONSE_BYTES = 131_072;
const MAX_JWK_COUNT = 16;
const MAX_JWK_ID_BYTES = 256;
const MAX_JWK_MODULUS_BYTES = 8_192;
const MAX_JWK_EXPONENT_BYTES = 64;
const MAX_CLAIM_BYTES = 4_096;
const CLOCK_TOLERANCE_SECONDS = 60;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type AccessJwtFailureCode = "config" | "token" | "jwks";

export type AccessJwtFailureReason =
  | "config_missing"
  | "config_invalid"
  | "jwks_fetch_failed"
  | "jwks_http_error"
  | "jwks_too_large"
  | "jwks_invalid_json_or_shape"
  | "token_invalid";

export class AccessJwtError extends Error {
  constructor(
    public readonly code: AccessJwtFailureCode,
    public readonly reason: AccessJwtFailureReason,
    message = "The Cloudflare Access token could not be verified.",
  ) {
    super(message);
    this.name = "AccessJwtError";
  }
}

export type AccessJwtClaims = {
  [key: string]: unknown;
};

export type AccessJwtVerificationOptions = {
  teamDomain?: string;
  audience?: string;
  nowSeconds?: number;
  fetcher?: typeof fetch;
};

export type AccessIdentity = {
  userId: string | null;
  email: string | null;
};

export type LocalApiIdentity = AccessIdentity & { ownerKey: string };

export function localApiIdentity(options: {
  ownerKey?: string;
  userId?: string | null;
  email?: string | null;
}): LocalApiIdentity {
  const ownerKey = options.ownerKey?.trim();
  const userId = options.userId?.trim() || null;
  const email = options.email?.trim() || null;
  return {
    ownerKey: ownerKey || userId || email || "local",
    userId,
    email,
  };
}

export function isOwnerAllowlistConfigured(options: {
  allowedEmail?: string;
  allowedUserId?: string;
}): boolean {
  return Boolean(options.allowedEmail?.trim() || options.allowedUserId?.trim());
}

export function isOwnerIdentityAllowed(options: {
  identity: AccessIdentity;
  allowedEmail?: string;
  allowedUserId?: string;
}): boolean {
  const allowedEmail = options.allowedEmail?.trim().toLowerCase();
  const allowedUserId = options.allowedUserId?.trim();
  const email = options.identity.email?.trim().toLowerCase() ?? null;
  const userId = options.identity.userId?.trim() ?? null;

  return (!allowedEmail || email === allowedEmail) && (!allowedUserId || userId === allowedUserId);
}

function fail(code: AccessJwtFailureCode, reason: AccessJwtFailureReason, message?: string): never {
  throw new AccessJwtError(code, reason, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function claimString(value: unknown, maxLength = MAX_CLAIM_BYTES): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= maxLength ? result : null;
}

function normaliseTeamOrigin(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) fail("config", "config_missing", "Cloudflare Access team domain is not configured.");
  if (trimmed.length > 512) fail("config", "config_invalid", "Cloudflare Access team domain is invalid.");

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    fail("config", "config_invalid", "Cloudflare Access team domain is invalid.");
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    fail("config", "config_invalid", "Cloudflare Access team domain is invalid.");
  }
  return url.origin;
}

function normaliseAudience(value: string | undefined): string {
  const result = value?.trim();
  if (!result) fail("config", "config_missing", "Cloudflare Access audience is not configured.");
  if (result.length > 512) fail("config", "config_invalid", "Cloudflare Access audience is invalid.");
  return result;
}

function decodeBase64Url(value: string, maxBytes: number): Uint8Array {
  if (!value || value.length > maxBytes * 2 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    fail("token", "token_invalid");
  }
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    fail("token", "token_invalid");
  }
  if (binary.length > maxBytes) fail("token", "token_invalid");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeJsonSegment(value: string, maxBytes: number): unknown {
  const bytes = decodeBase64Url(value, maxBytes);
  try {
    return JSON.parse(textDecoder.decode(bytes)) as unknown;
  } catch {
    fail("token", "token_invalid");
  }
}

async function readBoundedResponse(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JWK_RESPONSE_BYTES) {
    fail("jwks", "jwks_too_large", "The Cloudflare Access key response is too large.");
  }

  if (!response.body) {
    const value = await response.text();
    if (new TextEncoder().encode(value).byteLength > MAX_JWK_RESPONSE_BYTES) {
      fail("jwks", "jwks_too_large", "The Cloudflare Access key response is too large.");
    }
    return value;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteCount += chunk.value.byteLength;
      if (byteCount > MAX_JWK_RESPONSE_BYTES) {
        await reader.cancel("jwks_too_large");
        fail("jwks", "jwks_too_large", "The Cloudflare Access key response is too large.");
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
  return textDecoder.decode(bytes);
}

async function loadVerificationKey(
  certsUrl: string,
  keyId: string,
  fetcher: typeof fetch,
): Promise<CryptoKey> {
  let response: Response;
  try {
    response = await fetcher(certsUrl, { headers: { accept: "application/json" } });
  } catch {
    fail("jwks", "jwks_fetch_failed", "The Cloudflare Access keys could not be loaded.");
  }
  if (!response.ok) fail("jwks", "jwks_http_error", "The Cloudflare Access keys could not be loaded.");

  let body: unknown;
  try {
    body = JSON.parse(await readBoundedResponse(response)) as unknown;
  } catch (error) {
    if (error instanceof AccessJwtError) throw error;
    fail("jwks", "jwks_invalid_json_or_shape", "The Cloudflare Access key response is invalid.");
  }
  if (!isRecord(body) || !Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > MAX_JWK_COUNT) {
    fail("jwks", "jwks_invalid_json_or_shape", "The Cloudflare Access key response is invalid.");
  }

  const jwk = body.keys.find((candidate) => isRecord(candidate) && candidate.kid === keyId);
  if (!isRecord(jwk)) fail("token", "token_invalid");

  const jwkId = claimString(jwk.kid, MAX_JWK_ID_BYTES);
  const modulus = claimString(jwk.n, MAX_JWK_MODULUS_BYTES);
  const exponent = claimString(jwk.e, MAX_JWK_EXPONENT_BYTES);
  if (
    jwkId !== keyId ||
    jwk.kty !== "RSA" ||
    jwk.alg !== "RS256" ||
    (jwk.use !== undefined && jwk.use !== "sig") ||
    !modulus ||
    !exponent
  ) {
    fail("jwks", "jwks_invalid_json_or_shape", "The Cloudflare Access key response is invalid.");
  }

  try {
    return await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: modulus, e: exponent, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    fail("jwks", "jwks_invalid_json_or_shape", "The Cloudflare Access key response is invalid.");
  }
}

export async function verifyAccessJwt(
  request: Request,
  options: AccessJwtVerificationOptions,
): Promise<AccessJwtClaims> {
  const issuer = normaliseTeamOrigin(options.teamDomain);
  const audience = normaliseAudience(options.audience);
  const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
  if (!token || token.length > MAX_JWT_BYTES) fail("token", "token_invalid");

  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment)) fail("token", "token_invalid");
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeJsonSegment(encodedHeader, 4_096);
  const payload = decodeJsonSegment(encodedPayload, 16_384);
  if (!isRecord(header) || !isRecord(payload)) fail("token", "token_invalid");

  const algorithm = claimString(header.alg, 16);
  const keyId = claimString(header.kid, MAX_JWK_ID_BYTES);
  if (algorithm !== "RS256" || !keyId) fail("token", "token_invalid");

  const tokenIssuer = claimString(payload.iss, MAX_CLAIM_BYTES);
  if (tokenIssuer !== issuer && tokenIssuer !== `${issuer}/`) fail("token", "token_invalid");

  const tokenAudience = payload.aud;
  const audienceMatches =
    tokenAudience === audience ||
    (Array.isArray(tokenAudience) &&
      tokenAudience.length <= 32 &&
      tokenAudience.some((value) => value === audience));
  if (!audienceMatches) fail("token", "token_invalid");

  const nowSeconds = Math.floor(options.nowSeconds ?? Date.now() / 1_000);
  const expiry = payload.exp;
  if (typeof expiry !== "number" || !Number.isFinite(expiry) || expiry < nowSeconds - CLOCK_TOLERANCE_SECONDS) {
    fail("token", "token_invalid");
  }
  const notBefore = payload.nbf;
  if (
    notBefore !== undefined &&
    (typeof notBefore !== "number" || !Number.isFinite(notBefore) || notBefore > nowSeconds + CLOCK_TOLERANCE_SECONDS)
  ) {
    fail("token", "token_invalid");
  }

  const email = claimString(payload.email);
  const userId = claimString(payload.sub) ?? claimString(payload.user_uuid);
  if (!email && !userId) fail("token", "token_invalid");

  const signature = decodeBase64Url(encodedSignature, 4_096);
  const key = await loadVerificationKey(
    `${issuer}/cdn-cgi/access/certs`,
    keyId,
    options.fetcher ?? globalThis.fetch.bind(globalThis),
  );
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      signature as unknown as BufferSource,
      textEncoder.encode(`${encodedHeader}.${encodedPayload}`) as unknown as BufferSource,
    );
  } catch {
    fail("token", "token_invalid");
  }
  if (!valid) fail("token", "token_invalid");
  return payload;
}

export function accessIdentityFromClaims(claims: AccessJwtClaims): AccessIdentity {
  return {
    email: claimString(claims.email),
    userId: claimString(claims.sub) ?? claimString(claims.user_uuid),
  };
}
