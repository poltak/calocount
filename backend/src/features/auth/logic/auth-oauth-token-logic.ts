import { Logic } from "@app/common/features/core/logic/logic";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type { AppConfig } from "../../core/types.js";
import {
  randomToken,
  secretsEqual,
  sha256Base64Url,
  sha256Hex,
} from "../../core/utils/crypto.js";
import type { OauthClient } from "../storage/types.js";
import { OAuthError } from "../utils/oauth-error.js";
import { bearerChallenge, oauthUrls } from "../utils/oauth-urls.js";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const ACCESS_TOKEN_TTL_MS = 60 * MINUTE_MS;
const REFRESH_TOKEN_TTL_MS = 180 * DAY_MS;
/** A rotated refresh token keeps working this long, so a client that lost the response can retry. */
const REFRESH_GRACE_MS = 2 * MINUTE_MS;
/** A connection shows when it was last used. Writing it on every call is not needed. */
const LAST_USED_RESOLUTION_MS = 60 * MINUTE_MS;

type AuthOAuthTokenProps = BackendLogicProps<"auth", "clock"> &
  BackendAtomicProps & {
    config: Pick<AppConfig, "ownerKey">;
  };

function decodeFormComponent(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, " "));
}

/** The tokens of the connected apps: the token endpoint, and the check of an access token. */
export class AuthOAuthTokenLogic extends Logic<
  AuthOAuthTokenProps,
  Record<string, never>
> {
  constructor(deps: AuthOAuthTokenProps) {
    super({ deps, initialState: {} });
  }

  /** The `WWW-Authenticate` value for a request that has no valid access token. */
  challenge({
    origin,
    invalidToken,
  }: {
    origin: string;
    invalidToken: boolean;
  }): string {
    return bearerChallenge({ origin, invalidToken });
  }

  /** Answer a token request (RFC 6749 section 3.2) with the authorization code or the refresh token grant. */
  async exchange({
    form,
    authorization,
  }: {
    form: URLSearchParams;
    authorization: string | null;
  }) {
    const client = await this.authenticateClient({ form, authorization });
    const grantType = form.get("grant_type");
    if (grantType === "authorization_code") {
      return this.exchangeCode({ form, client });
    }
    if (grantType === "refresh_token") {
      return this.exchangeRefreshToken({ form, client });
    }
    throw new OAuthError(
      400,
      "unsupported_grant_type",
      "grant_type must be authorization_code or refresh_token.",
    );
  }

  /** The owner of a valid access token for the MCP endpoint, or `null`. */
  async verifyAccessToken({
    token,
    origin,
  }: {
    token: string;
    origin: string;
  }): Promise<{ ownerKey: string } | null> {
    if (token.length > 200) {
      return null;
    }
    const { storage, services } = this.deps;
    const now = services.clock.now();
    const row = await storage.auth.findAccessTokenGrant({
      id: await sha256Hex({ value: token }),
      now,
    });
    if (
      !row ||
      row.resource !== oauthUrls(origin).resource ||
      row.ownerKey !== this.deps.config.ownerKey
    ) {
      return null;
    }
    if (
      row.lastUsedAt === null ||
      now - row.lastUsedAt > LAST_USED_RESOLUTION_MS
    ) {
      await storage.auth.markGrantUsed({ id: row.grantId, now });
    }
    return { ownerKey: row.ownerKey };
  }

  private async exchangeCode({
    form,
    client,
  }: {
    form: URLSearchParams;
    client: OauthClient;
  }) {
    const { storage, services } = this.deps;
    const now = services.clock.now();
    const code = form.get("code");
    const verifier = form.get("code_verifier");
    if (!code || code.length > 200) {
      throw new OAuthError(400, "invalid_request", "code is required.");
    }
    if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      throw new OAuthError(
        400,
        "invalid_request",
        "code_verifier is required and must have 43 to 128 characters.",
      );
    }
    // Remove the code first, so it works once even when the rest of the request fails.
    const stored = await storage.auth.takeCode({
      id: await sha256Hex({ value: code }),
    });
    if (!stored || stored.expiresAt <= now || stored.clientId !== client.id) {
      throw new OAuthError(
        400,
        "invalid_grant",
        "The authorization code is not valid.",
      );
    }
    const redirectUri = form.get("redirect_uri");
    if (redirectUri !== null && redirectUri !== stored.redirectUri) {
      throw new OAuthError(
        400,
        "invalid_grant",
        "redirect_uri does not match the authorization request.",
      );
    }
    if ((await sha256Base64Url({ value: verifier })) !== stored.codeChallenge) {
      throw new OAuthError(
        400,
        "invalid_grant",
        "code_verifier does not match the code challenge.",
      );
    }
    const grant = await storage.auth.findGrant({ id: stored.grantId });
    if (!grant) {
      throw new OAuthError(
        400,
        "invalid_grant",
        "The owner removed this connection.",
      );
    }
    checkResource({ form, grantResource: grant.resource });
    return {
      ...(await this.issueTokens({
        grantId: grant.id,
        clientId: client.id,
        keptRefreshToken: null,
        now,
      })),
      ...(grant.scope ? { scope: grant.scope } : {}),
    };
  }

  private async exchangeRefreshToken({
    form,
    client,
  }: {
    form: URLSearchParams;
    client: OauthClient;
  }) {
    const { storage, services } = this.deps;
    const now = services.clock.now();
    const refreshToken = form.get("refresh_token");
    if (!refreshToken || refreshToken.length > 200) {
      throw new OAuthError(
        400,
        "invalid_request",
        "refresh_token is required.",
      );
    }
    const id = await sha256Hex({ value: refreshToken });
    const stored = await storage.auth.findLiveRefreshToken({ id, now });
    if (!stored || stored.clientId !== client.id) {
      throw new OAuthError(
        400,
        "invalid_grant",
        "The refresh token is not valid.",
      );
    }
    const grant = await storage.auth.findGrant({ id: stored.grantId });
    if (!grant) {
      throw new OAuthError(
        400,
        "invalid_grant",
        "The owner removed this connection.",
      );
    }
    checkResource({ form, grantResource: grant.resource });
    // OAuth 2.1 requires a new refresh token for a public client. A confidential client keeps its token.
    const rotate = client.secretHash === null;
    if (rotate) {
      await storage.auth.setTokenExpiry({
        id,
        expiresAt: Math.min(stored.expiresAt, now + REFRESH_GRACE_MS),
      });
    }
    return {
      ...(await this.issueTokens({
        grantId: grant.id,
        clientId: client.id,
        keptRefreshToken: rotate ? null : refreshToken,
        now,
      })),
      ...(grant.scope ? { scope: grant.scope } : {}),
    };
  }

  /** The client of a token request, after it proves who it is (RFC 6749 section 2.3). */
  private async authenticateClient({
    form,
    authorization,
  }: {
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
        if (separator < 0) {
          throw new Error("no separator");
        }
        headerClientId = decodeFormComponent(decoded.slice(0, separator));
        secret = decodeFormComponent(decoded.slice(separator + 1));
      } catch {
        throw new OAuthError(
          401,
          "invalid_client",
          "The client credentials are not valid.",
        );
      }
      if (clientId !== null && clientId !== headerClientId) {
        throw new OAuthError(
          400,
          "invalid_request",
          "client_id in the body differs from the Authorization header.",
        );
      }
      clientId = headerClientId;
    }
    const client =
      clientId && clientId.length <= 100
        ? await this.deps.storage.auth.findClient({ id: clientId })
        : undefined;
    if (!client) {
      throw new OAuthError(
        401,
        "invalid_client",
        "The client is not registered.",
      );
    }
    if (client.secretHash) {
      // A confidential client may send its secret in the header or in the body.
      if (
        !secret ||
        !(await secretsEqual({
          a: await sha256Hex({ value: secret }),
          b: client.secretHash,
        }))
      ) {
        throw new OAuthError(
          401,
          "invalid_client",
          "The client credentials are not valid.",
        );
      }
    }
    return client;
  }

  private async issueTokens({
    grantId,
    clientId,
    keptRefreshToken,
    now,
  }: {
    grantId: string;
    clientId: string;
    /** Keep this refresh token. Without it, a new one is made. */
    keptRefreshToken: string | null;
    now: number;
  }) {
    const accessToken = `cca_${randomToken()}`;
    const refreshToken = keptRefreshToken ?? `ccr_${randomToken()}`;
    const accessId = await sha256Hex({ value: accessToken });
    const refreshId = await sha256Hex({ value: refreshToken });
    await this.deps.atomic((planning) => [
      planning.auth.planInsertToken({
        id: accessId,
        kind: "access",
        grantId,
        clientId,
        createdAt: now,
        expiresAt: now + ACCESS_TOKEN_TTL_MS,
      }),
      keptRefreshToken
        ? planning.auth.planSetTokenExpiry({
            id: refreshId,
            expiresAt: now + REFRESH_TOKEN_TTL_MS,
          })
        : planning.auth.planInsertToken({
            id: refreshId,
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
      refresh_token: refreshToken,
    };
  }
}

function checkResource({
  form,
  grantResource,
}: {
  form: URLSearchParams;
  grantResource: string;
}): void {
  const resource = form.get("resource");
  if (resource !== null && resource.replace(/\/$/, "") !== grantResource) {
    throw new OAuthError(
      400,
      "invalid_target",
      `resource must be ${grantResource}.`,
    );
  }
}
