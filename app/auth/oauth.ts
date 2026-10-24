import { and, desc, eq, gt, isNull, lt, lte, notExists } from "drizzle-orm";
import type { AppDb } from "../../db/repository";
import { oauthClients, oauthCodes, oauthGrants, oauthTokens, type OauthClient } from "../../db/schema";
import { takeAttempt } from "./store";
import { randomToken, secretsEqual, sha256Base64Url, sha256Hex } from "./tokens";

// A small OAuth 2.1 authorization server for the MCP endpoint, as ChatGPT
// expects it: discovery documents (RFC 8414, RFC 9728), dynamic client
// registration (RFC 7591), the authorization code grant with PKCE S256,
// refresh tokens, and the `iss` authorization response parameter (RFC 9207).
// Tokens are random values. The database keeps only their SHA-256.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
export const ACCESS_TOKEN_TTL_MS = 60 * MINUTE_MS;
export const REFRESH_TOKEN_TTL_MS = 180 * DAY_MS;
const CODE_TTL_MS = 5 * MINUTE_MS;
/** A rotated refresh token keeps working this long, so a client that lost the response can retry. */
const REFRESH_GRACE_MS = 2 * MINUTE_MS;
const REGISTRATION_WINDOW_MS = 60 * MINUTE_MS;
/** Registrations that one network can make in an hour. ChatGPT registers once for each connection. */
const MAX_REGISTRATIONS_PER_NETWORK = 10;
const MAX_REGISTRATIONS_TOTAL = 200;
const AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"] as const;
type AuthMethod = (typeof AUTH_METHODS)[number];

export class OAuthError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    readonly description: string,
  ) {
    super(description);
    this.name = "OAuthError";
  }
}

export function oauthUrls(origin: string) {
  return {
    issuer: origin,
    resource: `${origin}/mcp`,
    authorizationEndpoint: `${origin}/oauth/authorize`,
    tokenEndpoint: `${origin}/oauth/token`,
    registrationEndpoint: `${origin}/oauth/register`,
    resourceMetadata: `${origin}/.well-known/oauth-protected-resource/mcp`,
  };
}

export function protectedResourceMetadata(origin: string) {
  const urls = oauthUrls(origin);
  return {
    resource: urls.resource,
    authorization_servers: [urls.issuer],
    bearer_methods_supported: ["header"],
    resource_name: "Calocount",
  };
}

export function authorizationServerMetadata(origin: string) {
  const urls = oauthUrls(origin);
  return {
    issuer: urls.issuer,
    authorization_endpoint: urls.authorizationEndpoint,
    token_endpoint: urls.tokenEndpoint,
    registration_endpoint: urls.registrationEndpoint,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [...AUTH_METHODS],
    authorization_response_iss_parameter_supported: true,
  };
}

/** The `WWW-Authenticate` value that sends an MCP client to the discovery documents. */
export function bearerChallenge({ origin, invalidToken }: { origin: string; invalidToken: boolean }): string {
  const error = invalidToken ? `, error="invalid_token", error_description="The access token is not valid."` : "";
  return `Bearer resource_metadata="${oauthUrls(origin).resourceMetadata}"${error}`;
}

/** HTTPS, or HTTP on this computer for local tools. No fragment, and no user name or password. */
function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  // Remove control characters, so a name cannot break the consent page layout.
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text ? text.slice(0, maxLength) : null;
}

/** Register a client (RFC 7591). The response carries the only copy of a client secret. */
export async function registerClient({ db, body, network, now = Date.now() }: {
  db: AppDb;
  body: Record<string, unknown>;
  /** The `networkKey` of the request, for the rate limit. */
  network: string;
  now?: number;
}) {
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10 || !redirectUris.every(isAllowedRedirectUri)) {
    throw new OAuthError(400, "invalid_redirect_uri", "redirect_uris must be 1 to 10 HTTPS URLs, or HTTP URLs on localhost.");
  }
  const requestedMethod = body.token_endpoint_auth_method ?? "client_secret_basic";
  if (!AUTH_METHODS.includes(requestedMethod as AuthMethod)) {
    throw new OAuthError(400, "invalid_client_metadata", `token_endpoint_auth_method must be one of: ${AUTH_METHODS.join(", ")}.`);
  }
  const method = requestedMethod as AuthMethod;
  const grantTypes = body.grant_types ?? ["authorization_code", "refresh_token"];
  if (!Array.isArray(grantTypes) || !grantTypes.every((type) => type === "authorization_code" || type === "refresh_token")) {
    throw new OAuthError(400, "invalid_client_metadata", "grant_types may contain only authorization_code and refresh_token.");
  }
  const responseTypes = body.response_types ?? ["code"];
  if (!Array.isArray(responseTypes) || !responseTypes.every((type) => type === "code")) {
    throw new OAuthError(400, "invalid_client_metadata", "response_types may contain only code.");
  }

  const attempt = await takeAttempt({
    db,
    limits: [
      { kind: `oauth_register:${network}`, max: MAX_REGISTRATIONS_PER_NETWORK, windowMs: REGISTRATION_WINDOW_MS },
      { kind: "oauth_register", max: MAX_REGISTRATIONS_TOTAL, windowMs: REGISTRATION_WINDOW_MS },
    ],
    now,
  });
  if (!attempt) throw new OAuthError(429, "temporarily_unavailable", "Too many client registrations. Try again later.");
  const clientId = `ccc_${randomToken(16)}`;
  const clientSecret = method === "none" ? null : `ccs_${randomToken()}`;
  const name = cleanText(body.client_name, 100) ?? "An unnamed app";
  await db.insert(oauthClients).values({
    id: clientId,
    secretHash: clientSecret ? await sha256Hex(clientSecret) : null,
    name,
    redirectUrisJson: JSON.stringify(redirectUris),
    tokenEndpointAuthMethod: method,
    createdAt: now,
  });
  return {
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(now / 1000),
    client_name: name,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: method,
    grant_types: grantTypes,
    response_types: ["code"],
  };
}

function redirectUrisOf(client: OauthClient): string[] {
  try {
    const value = JSON.parse(client.redirectUrisJson) as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** The statements that remove one connection with its codes and tokens. */
function deleteGrantStatements(db: AppDb, grantId: string) {
  return [
    db.delete(oauthTokens).where(eq(oauthTokens.grantId, grantId)),
    db.delete(oauthCodes).where(eq(oauthCodes.grantId, grantId)),
    db.delete(oauthGrants).where(eq(oauthGrants.id, grantId)),
  ] as const;
}

export type AuthorizationRequest = {
  client: OauthClient;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
  resource: string;
};

/**
 * The result of checking an authorization request. Every error shows on the
 * Calocount page and never redirects. Anyone can register a client with any
 * HTTPS redirect URI, so an error redirect would let a link on this site send
 * a visitor to another site (RFC 9700 section 4.11.2).
 */
export type AuthorizationRequestCheck =
  | { ok: true; request: AuthorizationRequest }
  | { ok: false; description: string };

/** Add the response parameters and the issuer to a redirect URI. */
function redirectWith(redirectUri: string, origin: string, params: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(name, value);
  }
  url.searchParams.set("iss", oauthUrls(origin).issuer);
  return url.toString();
}

export async function checkAuthorizationRequest({ db, params, origin }: {
  db: AppDb;
  params: URLSearchParams;
  origin: string;
}): Promise<AuthorizationRequestCheck> {
  const clientId = params.get("client_id");
  const client = clientId && clientId.length <= 100
    ? await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1).get()
    : undefined;
  if (!client) return { ok: false, description: "This app is not registered with Calocount." };

  const registered = redirectUrisOf(client);
  const requestedRedirect = params.get("redirect_uri");
  const redirectUri = requestedRedirect ?? (registered.length === 1 ? registered[0] : null);
  if (!redirectUri || !registered.includes(redirectUri)) {
    return { ok: false, description: "The app asked to return to an address that it did not register." };
  }

  const state = params.get("state");
  if (params.get("response_type") !== "code") return { ok: false, description: "The app asked for an unsupported response type." };
  const codeChallenge = params.get("code_challenge") ?? "";
  if (params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    return { ok: false, description: "The app did not use PKCE with the S256 method." };
  }
  const resource = params.get("resource");
  const expectedResource = oauthUrls(origin).resource;
  if (resource !== null && resource.replace(/\/$/, "") !== expectedResource) {
    return { ok: false, description: `The app asked for another resource. Use ${expectedResource}.` };
  }
  return {
    ok: true,
    request: {
      client,
      redirectUri,
      state,
      codeChallenge,
      scope: cleanText(params.get("scope"), 200) ?? "",
      resource: expectedResource,
    },
  };
}

/**
 * Record the owner's approval and return the redirect that carries the code.
 * An earlier approval of the same app ends, so each app has one connection.
 */
export async function approveAuthorization({ db, request, ownerKey, origin, now = Date.now() }: {
  db: AppDb;
  request: AuthorizationRequest;
  ownerKey: string;
  origin: string;
  now?: number;
}): Promise<string> {
  const grantId = `ccg_${randomToken(16)}`;
  const code = randomToken();
  const previous = await db.select({ id: oauthGrants.id }).from(oauthGrants)
    .where(and(eq(oauthGrants.ownerKey, ownerKey), eq(oauthGrants.clientId, request.client.id))).all();
  // Different IDs, so the order of the new rows and the removals does not matter.
  await db.batch([
    db.insert(oauthGrants).values({
      id: grantId,
      clientId: request.client.id,
      ownerKey,
      scope: request.scope,
      resource: request.resource,
      createdAt: now,
    }),
    db.insert(oauthCodes).values({
      id: await sha256Hex(code),
      grantId,
      clientId: request.client.id,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      createdAt: now,
      expiresAt: now + CODE_TTL_MS,
    }),
    db.update(oauthClients).set({ approvedAt: now }).where(eq(oauthClients.id, request.client.id)),
    ...previous.flatMap(({ id }) => deleteGrantStatements(db, id)),
  ]);
  return redirectWith(request.redirectUri, origin, { code, state: request.state });
}

export function denyAuthorization({ request, origin }: { request: AuthorizationRequest; origin: string }): string {
  return redirectWith(request.redirectUri, origin, {
    error: "access_denied",
    error_description: "The owner did not allow this app.",
    state: request.state,
  });
}

function decodeFormComponent(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, " "));
}

/** The client of a token request, after it proves who it is (RFC 6749 section 2.3). */
async function authenticateClient({ db, form, authorization }: {
  db: AppDb;
  form: URLSearchParams;
  authorization: string | null;
}): Promise<OauthClient> {
  let clientId = form.get("client_id");
  let secret = form.get("client_secret");
  if (authorization?.toLowerCase().startsWith("basic ")) {
    let headerClientId: string;
    try {
      const decoded = atob(authorization.slice(6).trim());
      const separator = decoded.indexOf(":");
      if (separator < 0) throw new Error("no separator");
      headerClientId = decodeFormComponent(decoded.slice(0, separator));
      secret = decodeFormComponent(decoded.slice(separator + 1));
    } catch {
      throw new OAuthError(401, "invalid_client", "The client credentials are not valid.");
    }
    if (clientId !== null && clientId !== headerClientId) {
      throw new OAuthError(400, "invalid_request", "client_id in the body differs from the Authorization header.");
    }
    clientId = headerClientId;
  }
  const client = clientId && clientId.length <= 100
    ? await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1).get()
    : undefined;
  if (!client) throw new OAuthError(401, "invalid_client", "The client is not registered.");
  if (client.secretHash) {
    // A confidential client may send its secret in the header or in the body.
    if (!secret || !(await secretsEqual(await sha256Hex(secret), client.secretHash))) {
      throw new OAuthError(401, "invalid_client", "The client credentials are not valid.");
    }
  }
  return client;
}

async function issueTokens({ db, grantId, clientId, refreshToken, now }: {
  db: AppDb;
  grantId: string;
  clientId: string;
  /** Keep this refresh token. Without it, a new one is made. */
  refreshToken: string | null;
  now: number;
}) {
  const accessToken = `cca_${randomToken()}`;
  const nextRefreshToken = refreshToken ?? `ccr_${randomToken()}`;
  await db.batch([
    db.insert(oauthTokens).values({
      id: await sha256Hex(accessToken),
      kind: "access",
      grantId,
      clientId,
      createdAt: now,
      expiresAt: now + ACCESS_TOKEN_TTL_MS,
    }),
    refreshToken
      ? db.update(oauthTokens).set({ expiresAt: now + REFRESH_TOKEN_TTL_MS }).where(eq(oauthTokens.id, await sha256Hex(refreshToken)))
      : db.insert(oauthTokens).values({
        id: await sha256Hex(nextRefreshToken),
        kind: "refresh",
        grantId,
        clientId,
        createdAt: now,
        expiresAt: now + REFRESH_TOKEN_TTL_MS,
      }),
  ]);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: nextRefreshToken,
  };
}

function checkResource(form: URLSearchParams, grantResource: string): void {
  const resource = form.get("resource");
  if (resource !== null && resource.replace(/\/$/, "") !== grantResource) {
    throw new OAuthError(400, "invalid_target", `resource must be ${grantResource}.`);
  }
}

/** Answer a token request (RFC 6749 section 3.2) with the authorization code or the refresh token grant. */
export async function exchangeToken({ db, form, authorization, now = Date.now() }: {
  db: AppDb;
  form: URLSearchParams;
  authorization: string | null;
  now?: number;
}) {
  const client = await authenticateClient({ db, form, authorization });
  const grantType = form.get("grant_type");

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const verifier = form.get("code_verifier");
    if (!code || code.length > 200) throw new OAuthError(400, "invalid_request", "code is required.");
    if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      throw new OAuthError(400, "invalid_request", "code_verifier is required and must have 43 to 128 characters.");
    }
    // Remove the code first, so it works once even when the rest of the request fails.
    const [stored] = await db.delete(oauthCodes).where(eq(oauthCodes.id, await sha256Hex(code))).returning();
    if (!stored || stored.expiresAt <= now || stored.clientId !== client.id) {
      throw new OAuthError(400, "invalid_grant", "The authorization code is not valid.");
    }
    const redirectUri = form.get("redirect_uri");
    if (redirectUri !== null && redirectUri !== stored.redirectUri) {
      throw new OAuthError(400, "invalid_grant", "redirect_uri does not match the authorization request.");
    }
    if (await sha256Base64Url(verifier) !== stored.codeChallenge) {
      throw new OAuthError(400, "invalid_grant", "code_verifier does not match the code challenge.");
    }
    const grant = await db.select().from(oauthGrants).where(eq(oauthGrants.id, stored.grantId)).limit(1).get();
    if (!grant) throw new OAuthError(400, "invalid_grant", "The owner removed this connection.");
    checkResource(form, grant.resource);
    return { ...(await issueTokens({ db, grantId: grant.id, clientId: client.id, refreshToken: null, now })), ...(grant.scope ? { scope: grant.scope } : {}) };
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    if (!refreshToken || refreshToken.length > 200) throw new OAuthError(400, "invalid_request", "refresh_token is required.");
    const id = await sha256Hex(refreshToken);
    const stored = await db.select().from(oauthTokens)
      .where(and(eq(oauthTokens.id, id), eq(oauthTokens.kind, "refresh"), gt(oauthTokens.expiresAt, now)))
      .limit(1).get();
    if (!stored || stored.clientId !== client.id) throw new OAuthError(400, "invalid_grant", "The refresh token is not valid.");
    const grant = await db.select().from(oauthGrants).where(eq(oauthGrants.id, stored.grantId)).limit(1).get();
    if (!grant) throw new OAuthError(400, "invalid_grant", "The owner removed this connection.");
    checkResource(form, grant.resource);
    // OAuth 2.1 requires a new refresh token for a public client. A confidential client keeps its token.
    const rotate = client.secretHash === null;
    if (rotate) {
      await db.update(oauthTokens).set({ expiresAt: Math.min(stored.expiresAt, now + REFRESH_GRACE_MS) }).where(eq(oauthTokens.id, id));
    }
    return {
      ...(await issueTokens({ db, grantId: grant.id, clientId: client.id, refreshToken: rotate ? null : refreshToken, now })),
      ...(grant.scope ? { scope: grant.scope } : {}),
    };
  }

  throw new OAuthError(400, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token.");
}

/** The owner of a valid access token for this MCP endpoint, or null. */
export async function verifyAccessToken({ db, token, origin, now = Date.now() }: {
  db: AppDb;
  token: string;
  origin: string;
  now?: number;
}): Promise<{ ownerKey: string } | null> {
  if (token.length > 200) return null;
  const row = await db.select({ grantId: oauthGrants.id, ownerKey: oauthGrants.ownerKey, resource: oauthGrants.resource, lastUsedAt: oauthGrants.lastUsedAt })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId))
    .where(and(eq(oauthTokens.id, await sha256Hex(token)), eq(oauthTokens.kind, "access"), gt(oauthTokens.expiresAt, now)))
    .limit(1).get();
  if (!row || row.resource !== oauthUrls(origin).resource) return null;
  if (row.lastUsedAt === null || now - row.lastUsedAt > 60 * MINUTE_MS) {
    await db.update(oauthGrants).set({ lastUsedAt: now }).where(eq(oauthGrants.id, row.grantId));
  }
  return { ownerKey: row.ownerKey };
}

/** The apps that the owner connected, newest first. */
export async function listConnections({ db, ownerKey }: { db: AppDb; ownerKey: string }) {
  return db.select({
    id: oauthGrants.id,
    name: oauthClients.name,
    createdAt: oauthGrants.createdAt,
    lastUsedAt: oauthGrants.lastUsedAt,
  }).from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .where(eq(oauthGrants.ownerKey, ownerKey))
    .orderBy(desc(oauthGrants.createdAt))
    .all();
}

/** Remove a connection and stop all of its tokens. */
export async function removeConnection({ db, ownerKey, id }: { db: AppDb; ownerKey: string; id: string }): Promise<boolean> {
  const grant = await db.select({ id: oauthGrants.id }).from(oauthGrants)
    .where(and(eq(oauthGrants.ownerKey, ownerKey), eq(oauthGrants.id, id))).limit(1).get();
  if (!grant) return false;
  await db.batch(deleteGrantStatements(db, grant.id));
  return true;
}

/**
 * Remove expired codes and tokens, connections without a working refresh
 * token, and registered clients that the owner never allowed within a day. A
 * client that the owner allowed once stays: ChatGPT keeps its client ID and
 * uses it again after a disconnect.
 */
export async function deleteExpiredOAuthRows({ db, now = Date.now() }: { db: AppDb; now?: number }): Promise<void> {
  await db.batch([
    db.delete(oauthCodes).where(lte(oauthCodes.expiresAt, now)),
    db.delete(oauthTokens).where(lte(oauthTokens.expiresAt, now)),
    db.delete(oauthGrants).where(and(
      lt(oauthGrants.createdAt, now - DAY_MS),
      notExists(db.select({ id: oauthTokens.id }).from(oauthTokens)
        .where(and(eq(oauthTokens.grantId, oauthGrants.id), eq(oauthTokens.kind, "refresh")))),
    )),
    db.delete(oauthClients).where(and(isNull(oauthClients.approvedAt), lt(oauthClients.createdAt, now - DAY_MS))),
  ]);
}
