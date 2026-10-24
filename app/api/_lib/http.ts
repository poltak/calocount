import { getDb, getEnvBinding, getEnvValue } from "../../../db";
import { isSameOriginWrite, readSessionCookie } from "../../auth/cookies";
import { resolveAuthMode, type AuthMode } from "../../auth/mode";
import { bearerChallenge, verifyAccessToken } from "../../auth/oauth";
import { findSession } from "../../auth/store";
import { readBoundedBytes } from "./bounded-read";
import {
  AccessJwtError,
  accessIdentityFromClaims,
  isOwnerAllowlistConfigured,
  isOwnerIdentityAllowed,
  localApiIdentity,
  verifyAccessJwt,
} from "./access-jwt";

const ACCESS_JWT_FAILURE_EVENT = "calocount_access_jwt_verification_failed";

function logAccessJwtFailure(error: unknown): void {
  const code = error instanceof AccessJwtError ? error.code : "unexpected";
  const reason = error instanceof AccessJwtError ? error.reason : "unexpected";
  console.warn(JSON.stringify({ event: ACCESS_JWT_FAILURE_EVENT, code, reason }));
}

function logAccessConfigurationFailure(reason: "access_settings_missing" | "owner_allowlist_missing"): void {
  logAccessJwtFailure(new AccessJwtError("config", reason));
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiIdentity = {
  ownerKey: string;
  userId: string | null;
  email: string | null;
};

function firstHeader(request: Request, names: string[]): string | null {
  for (const name of names) {
    const value = request.headers.get(name)?.trim();
    if (value && value.length <= 512) return value;
  }
  return null;
}

function configuredOwnerEmail(): string | undefined {
  // Use the encrypted production secret first. The old name remains a fallback
  // for local development and deployments that still use the older config.
  const value = getEnvValue("CALOCOUNT_OWNER_EMAIL")?.trim() || getEnvValue("CALOCOUNT_ALLOWED_EMAIL")?.trim();
  return value?.toLowerCase();
}

function configuredOwnerEmailSha256(): string | undefined {
  const value = getEnvValue("CALOCOUNT_ALLOWED_EMAIL_SHA256")?.trim();
  return value || undefined;
}

/** Local development turns sign-in off. Production must keep CALOCOUNT_ALLOW_LOCAL=false. */
export function isLocalAuth(): boolean {
  return getEnvValue("CALOCOUNT_ALLOW_LOCAL") === "true";
}

/** The sign-in method of this instance. An unknown CALOCOUNT_AUTH_MODE fails closed. */
export function configuredAuthMode(): AuthMode {
  const mode = resolveAuthMode({
    mode: getEnvValue("CALOCOUNT_AUTH_MODE"),
    accessTeamDomain: getEnvValue("CALOCOUNT_ACCESS_TEAM_DOMAIN"),
    accessAudience: getEnvValue("CALOCOUNT_ACCESS_AUDIENCE"),
  });
  if (!mode) throw new ApiError(503, "auth_mode_invalid", "CALOCOUNT_AUTH_MODE must be passkey or access.");
  return mode;
}

/** True when passkeys and OAuth protect this instance. Local development and Access mode return false. */
export function isPasskeyAuth(): boolean {
  return !isLocalAuth() && configuredAuthMode() === "passkey";
}

/** The key of the owner's data. Passkey mode has no identity provider, so it needs this value. */
export function configuredOwnerKey(): string {
  const ownerKey = getEnvValue("CALOCOUNT_OWNER_KEY")?.trim();
  if (!ownerKey) throw new ApiError(503, "auth_owner_key_missing", "CALOCOUNT_OWNER_KEY is not configured.");
  return ownerKey;
}

/** The live passkey session of the request, or null. */
export async function readSession(request: Request) {
  const token = readSessionCookie(request);
  if (!token) return null;
  const session = await findSession({ db: getRequestDb(), token, ownerKey: configuredOwnerKey() });
  return session ? { ...session, token } : null;
}

/**
 * Require the passkey session of the owner. A request that changes data must
 * also come from a page of this site.
 */
export async function requireSessionIdentity(request: Request): Promise<ApiIdentity> {
  const ownerKey = configuredOwnerKey();
  if (!readSessionCookie(request)) throw new ApiError(401, "sign_in_required", "Sign in to continue.");
  if (!isSameOriginWrite(request)) throw new ApiError(403, "invalid_origin", "The request must come from this site.");
  if (!(await readSession(request))) throw new ApiError(401, "sign_in_required", "Sign in to continue.");
  return { ownerKey, userId: null, email: null };
}

/**
 * Require the identity of an MCP request. Passkey mode checks an OAuth access
 * token and answers a failure with the challenge that starts the OAuth flow.
 * Access mode checks the Access JWT of the MCP application.
 */
export async function authorizeMcpRequest(request: Request): Promise<ApiIdentity | Response> {
  if (isLocalAuth() || configuredAuthMode() === "access") {
    return requireApiIdentity(request, { accessAudience: getEnvValue("CALOCOUNT_MCP_ACCESS_AUDIENCE") });
  }
  const ownerKey = configuredOwnerKey();
  const origin = new URL(request.url).origin;
  const token = request.headers.get("authorization")?.match(/^Bearer\s+([A-Za-z0-9_-]+)$/i)?.[1] ?? null;
  const identity = token ? await verifyAccessToken({ db: getRequestDb(), token, origin }) : null;
  if (!identity || identity.ownerKey !== ownerKey) {
    return jsonResponse(
      { error: { code: "unauthorized", message: "Sign-in is required." } },
      { status: 401, headers: { "www-authenticate": bearerChallenge({ origin, invalidToken: token !== null }) } },
    );
  }
  return { ownerKey, userId: null, email: null };
}

/**
 * Require the owner's identity: a passkey session, or a Cloudflare Access or
 * Sites identity in Access mode. Anonymous access is only enabled when
 * CALOCOUNT_ALLOW_LOCAL is explicitly set to "true".
 */
export async function requireApiIdentity(
  request: Request,
  options?: { accessAudience?: string },
): Promise<ApiIdentity> {
  const email = firstHeader(request, [
    "cf-access-authenticated-user-email",
    "oai-authenticated-user-email",
  ]);
  const userId = firstHeader(request, [
    "cf-access-authenticated-user-id",
    "oai-authenticated-user-id",
  ]);
  const allowedEmail = configuredOwnerEmail();
  const allowedEmailSha256 = configuredOwnerEmailSha256();
  const allowedUserId = getEnvValue("CALOCOUNT_ALLOWED_USER_ID")?.trim();
  const allowLocal = getEnvValue("CALOCOUNT_ALLOW_LOCAL") === "true";
  const accessTeamDomain = getEnvValue("CALOCOUNT_ACCESS_TEAM_DOMAIN")?.trim();
  const accessAudience = options === undefined
    ? getEnvValue("CALOCOUNT_ACCESS_AUDIENCE")?.trim()
    : options.accessAudience?.trim();

  if (allowLocal) {
    if (!email && !userId && !allowedEmail && !allowedEmailSha256 && !allowedUserId) {
      return localApiIdentity({ ownerKey: getEnvValue("CALOCOUNT_OWNER_KEY") });
    }
  } else {
    if (configuredAuthMode() === "passkey") return requireSessionIdentity(request);
    if (!accessTeamDomain || !accessAudience) {
      logAccessConfigurationFailure("access_settings_missing");
      throw new ApiError(503, "auth_access_settings_missing", "Owner authentication is not configured.");
    }
    if (!isOwnerAllowlistConfigured({ allowedEmail, allowedEmailSha256, allowedUserId })) {
      logAccessConfigurationFailure("owner_allowlist_missing");
      throw new ApiError(503, "auth_owner_allowlist_missing", "Owner authentication is not configured.");
    }

    let claims;
    try {
      claims = await verifyAccessJwt(request, {
        teamDomain: accessTeamDomain,
        audience: accessAudience,
      });
    } catch (error) {
      logAccessJwtFailure(error);
      if (error instanceof AccessJwtError && error.code === "config") {
        throw new ApiError(503, "auth_unavailable", "Owner authentication is not configured.");
      }
      if (error instanceof AccessJwtError && error.code === "jwks") {
        throw new ApiError(503, "auth_unavailable", "Owner authentication is temporarily unavailable.");
      }
      throw new ApiError(401, "unauthorized", "Sign-in is required.");
    }

    const identity = accessIdentityFromClaims(claims);
    if (!identity.email && !identity.userId) {
      throw new ApiError(401, "unauthorized", "Sign-in is required.");
    }
    if (!(await isOwnerIdentityAllowed({ identity, allowedEmail, allowedEmailSha256, allowedUserId }))) {
      throw new ApiError(403, "forbidden", "This account is not allowed.");
    }

    return {
      ownerKey: getEnvValue("CALOCOUNT_OWNER_KEY")?.trim() || identity.userId || identity.email || "owner",
      userId: identity.userId,
      email: identity.email,
    };
  }
  if (!(await isOwnerIdentityAllowed({ identity: { email, userId }, allowedEmail, allowedEmailSha256, allowedUserId }))) {
    throw new ApiError(403, "forbidden", "This account is not allowed.");
  }

  return localApiIdentity({ ownerKey: getEnvValue("CALOCOUNT_OWNER_KEY"), userId, email });
}

export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "pragma": "no-cache",
      "x-robots-tag": "noindex, nofollow, noarchive",
      ...init?.headers,
    },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonResponse({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error("calocount api error", error);
  return jsonResponse({ error: { code: "internal_error", message: "The request could not be completed." } }, { status: 500 });
}

export async function withApiErrors(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  const maxBodyBytes = 1_000_000;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    throw new ApiError(413, "payload_too_large", "The request is too large.");
  }

  if (!request.body) {
    throw new ApiError(400, "invalid_json", "The request body must be valid JSON.");
  }

  let value: unknown;
  try {
    const bytes = await readBoundedBytes(request.body, maxBodyBytes);
    if (bytes === null) throw new ApiError(413, "payload_too_large", "The request is too large.");
    value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_json", "The request body must be valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_body", "The request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function getRequestDb() {
  try {
    return getDb();
  } catch {
    throw new ApiError(503, "database_unavailable", "The database is not configured.");
  }
}

export function getPhotosBucket() {
  const photos = getEnvBinding("PHOTOS");
  if (!photos) throw new ApiError(503, "photos_unavailable", "Photo storage is not configured.");
  return photos;
}

export function requireString(value: unknown, field: string, options: { max?: number; optional?: boolean } = {}): string | undefined {
  if (value == null && options.optional) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, "invalid_field", `${field} must be a non-empty string.`);
  const result = value.trim();
  if (options.max && result.length > options.max) throw new ApiError(400, "invalid_field", `${field} is too long.`);
  return result;
}

export function optionalNumber(value: unknown, field: string, options: { min?: number; max?: number } = {}): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ApiError(400, "invalid_field", `${field} must be a number.`);
  if (options.min != null && value < options.min) throw new ApiError(400, "invalid_field", `${field} is too small.`);
  if (options.max != null && value > options.max) throw new ApiError(400, "invalid_field", `${field} is too large.`);
  return value;
}

export function routeId(request: Request, key: string): string {
  const value = new URL(request.url).searchParams.get(key)?.trim();
  if (!value) throw new ApiError(400, "missing_id", `${key} is required.`);
  return value;
}
