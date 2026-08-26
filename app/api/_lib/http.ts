import { getDb, getEnvBinding, getEnvValue } from "../../../db";
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

/**
 * Require a Cloudflare Access or Sites identity. Anonymous access is only
 * enabled when CALOCOUNT_ALLOW_LOCAL is explicitly set to "true".
 */
export async function requireApiIdentity(request: Request): Promise<ApiIdentity> {
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

  if (allowLocal) {
    if (!email && !userId && !allowedEmail && !allowedEmailSha256 && !allowedUserId) {
      return localApiIdentity({ ownerKey: getEnvValue("CALOCOUNT_OWNER_KEY") });
    }
  } else {
    if (!getEnvValue("CALOCOUNT_ACCESS_TEAM_DOMAIN")?.trim() || !getEnvValue("CALOCOUNT_ACCESS_AUDIENCE")?.trim()) {
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
        teamDomain: getEnvValue("CALOCOUNT_ACCESS_TEAM_DOMAIN"),
        audience: getEnvValue("CALOCOUNT_ACCESS_AUDIENCE"),
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
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteCount = 0;

    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        byteCount += chunk.value.byteLength;
        if (byteCount > maxBodyBytes) {
          await reader.cancel("payload_too_large");
          throw new ApiError(413, "payload_too_large", "The request is too large.");
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
