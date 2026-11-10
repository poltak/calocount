import { Logic } from "@app/common/features/core/logic/logic";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type { AppConfig } from "../../core/types.js";
import { randomToken, sha256Hex } from "../../core/utils/crypto.js";
import type { OauthClient } from "../storage/types.js";
import { OAuthError } from "../utils/oauth-error.js";
import {
  cleanText,
  isAllowedRedirectUri,
  redirectUrisOf,
  redirectWith,
} from "../utils/oauth-request.js";
import {
  AUTH_METHODS,
  oauthUrls,
  type AuthMethod,
} from "../utils/oauth-urls.js";

const MINUTE_MS = 60 * 1000;
const CODE_TTL_MS = 5 * MINUTE_MS;
const REGISTRATION_WINDOW_MS = 60 * MINUTE_MS;
/** Registrations that one network can make in an hour. ChatGPT registers once for each connection. */
const MAX_REGISTRATIONS_PER_NETWORK = 10;
const MAX_REGISTRATIONS_TOTAL = 200;
const TOTAL_REGISTRATIONS_KIND = "oauth_register";

type AuthOAuthProps = BackendLogicProps<"auth", "clock"> &
  BackendAtomicProps & {
    config: Pick<AppConfig, "ownerKey">;
  };

/** A checked authorization request. The consent page shows it, and the answer carries it back. */
export interface AuthorizationRequest {
  client: OauthClient;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
  resource: string;
}

/**
 * The result of checking an authorization request. Every error shows on the
 * Calocount page and never redirects. Anyone can register a client with any
 * HTTPS redirect URI, so an error redirect would let a link on this site send
 * a visitor to another site (RFC 9700 section 4.11.2).
 */
export type AuthorizationRequestCheck =
  | { ok: true; request: AuthorizationRequest }
  | { ok: false; description: string };

/** The apps that connect to the MCP endpoint: their registration, and the owner's consent. */
export class AuthOAuthLogic extends Logic<
  AuthOAuthProps,
  Record<string, never>
> {
  constructor(deps: AuthOAuthProps) {
    super({ deps, initialState: {} });
  }

  /** Register a client (RFC 7591). The answer carries the only copy of a client secret. */
  async registerClient({
    body,
    clientAddress,
  }: {
    body: Record<string, unknown>;
    clientAddress: string | undefined;
  }) {
    const { storage, services } = this.deps;
    const redirectUris = body["redirect_uris"];
    if (
      !Array.isArray(redirectUris) ||
      redirectUris.length === 0 ||
      redirectUris.length > 10 ||
      !redirectUris.every(isAllowedRedirectUri)
    ) {
      throw new OAuthError(
        400,
        "invalid_redirect_uri",
        "redirect_uris must be 1 to 10 HTTPS URLs, or HTTP URLs on localhost.",
      );
    }
    const requestedMethod =
      body["token_endpoint_auth_method"] ?? "client_secret_basic";
    if (!AUTH_METHODS.includes(requestedMethod as AuthMethod)) {
      throw new OAuthError(
        400,
        "invalid_client_metadata",
        `token_endpoint_auth_method must be one of: ${AUTH_METHODS.join(", ")}.`,
      );
    }
    const method = requestedMethod as AuthMethod;
    const grantTypes = body["grant_types"] ?? [
      "authorization_code",
      "refresh_token",
    ];
    if (
      !Array.isArray(grantTypes) ||
      !grantTypes.every(
        (type) => type === "authorization_code" || type === "refresh_token",
      )
    ) {
      throw new OAuthError(
        400,
        "invalid_client_metadata",
        "grant_types may contain only authorization_code and refresh_token.",
      );
    }
    const responseTypes = body["response_types"] ?? ["code"];
    if (
      !Array.isArray(responseTypes) ||
      !responseTypes.every((type) => type === "code")
    ) {
      throw new OAuthError(
        400,
        "invalid_client_metadata",
        "response_types may contain only code.",
      );
    }

    const now = services.clock.now();
    await this.takeRegistrationAttempt({ clientAddress, now });
    const clientId = `ccc_${randomToken({ bytes: 16 })}`;
    const clientSecret = method === "none" ? null : `ccs_${randomToken()}`;
    const name = cleanText(body["client_name"], 100) ?? "An unnamed app";
    await storage.auth.insertClient({
      id: clientId,
      secretHash: clientSecret
        ? await sha256Hex({ value: clientSecret })
        : null,
      name,
      redirectUrisJson: JSON.stringify(redirectUris),
      tokenEndpointAuthMethod: method,
      createdAt: now,
      approvedAt: null,
    });
    return {
      client_id: clientId,
      ...(clientSecret
        ? { client_secret: clientSecret, client_secret_expires_at: 0 }
        : {}),
      client_id_issued_at: Math.floor(now / 1000),
      client_name: name,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: method,
      grant_types: grantTypes,
      response_types: ["code"],
    };
  }

  async checkAuthorizationRequest({
    params,
    origin,
  }: {
    params: URLSearchParams;
    origin: string;
  }): Promise<AuthorizationRequestCheck> {
    const clientId = params.get("client_id");
    const client =
      clientId && clientId.length <= 100
        ? await this.deps.storage.auth.findClient({ id: clientId })
        : undefined;
    if (!client) {
      return {
        ok: false,
        description: "This app is not registered with Calocount.",
      };
    }
    const registered = redirectUrisOf(client.redirectUrisJson);
    const requestedRedirect = params.get("redirect_uri");
    const redirectUri =
      requestedRedirect ??
      (registered.length === 1 ? (registered[0] ?? null) : null);
    if (!redirectUri || !registered.includes(redirectUri)) {
      return {
        ok: false,
        description:
          "The app asked to return to an address that it did not register.",
      };
    }
    if (params.get("response_type") !== "code") {
      return {
        ok: false,
        description: "The app asked for an unsupported response type.",
      };
    }
    const codeChallenge = params.get("code_challenge") ?? "";
    if (
      params.get("code_challenge_method") !== "S256" ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)
    ) {
      return {
        ok: false,
        description: "The app did not use PKCE with the S256 method.",
      };
    }
    const resource = params.get("resource");
    const expectedResource = oauthUrls(origin).resource;
    if (resource !== null && resource.replace(/\/$/, "") !== expectedResource) {
      return {
        ok: false,
        description: `The app asked for another resource. Use ${expectedResource}.`,
      };
    }
    return {
      ok: true,
      request: {
        client,
        redirectUri,
        state: params.get("state"),
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
  async approve({
    request,
    origin,
  }: {
    request: AuthorizationRequest;
    origin: string;
  }): Promise<string> {
    const { storage, services, atomic, config } = this.deps;
    const now = services.clock.now();
    const grantId = `ccg_${randomToken({ bytes: 16 })}`;
    const code = randomToken();
    const previous = await storage.auth.listGrantIdsOfClient({
      ownerKey: config.ownerKey,
      clientId: request.client.id,
    });
    const codeId = await sha256Hex({ value: code });
    await atomic((planning) => [
      planning.auth.planInsertGrant({
        id: grantId,
        clientId: request.client.id,
        ownerKey: config.ownerKey,
        scope: request.scope,
        resource: request.resource,
        createdAt: now,
        lastUsedAt: null,
      }),
      planning.auth.planInsertCode({
        id: codeId,
        grantId,
        clientId: request.client.id,
        redirectUri: request.redirectUri,
        codeChallenge: request.codeChallenge,
        createdAt: now,
        expiresAt: now + CODE_TTL_MS,
      }),
      planning.auth.planMarkClientApproved({ id: request.client.id, now }),
      ...previous.flatMap((id) => planning.auth.planDeleteGrant({ id })),
    ]);
    return redirectWith({
      redirectUri: request.redirectUri,
      origin,
      params: { code, state: request.state },
    });
  }

  deny({
    request,
    origin,
  }: {
    request: AuthorizationRequest;
    origin: string;
  }): string {
    return redirectWith({
      redirectUri: request.redirectUri,
      origin,
      params: {
        error: "access_denied",
        error_description: "The owner did not allow this app.",
        state: request.state,
      },
    });
  }

  /** The attempt rows go in first, in the same batch as the counts, so parallel requests cannot pass the limit together. */
  private async takeRegistrationAttempt({
    clientAddress,
    now,
  }: {
    clientAddress: string | undefined;
    now: number;
  }): Promise<void> {
    const network = (
      await sha256Hex({
        value: `calocount-network:${clientAddress ?? "unknown"}`,
      })
    ).slice(0, 32);
    const networkKind = `${TOTAL_REGISTRATIONS_KIND}:${network}`;
    const rows = [networkKind, TOTAL_REGISTRATIONS_KIND].map((kind) => ({
      id: randomToken({ bytes: 16 }),
      kind,
      createdAt: now,
    }));
    const since = now - REGISTRATION_WINDOW_MS;
    const [, perNetwork, total] = await this.deps.atomic((planning) => [
      planning.auth.planInsertAttempts(rows),
      planning.auth.planCountAttempts({ kind: networkKind, since }),
      planning.auth.planCountAttempts({
        kind: TOTAL_REGISTRATIONS_KIND,
        since,
      }),
    ]);
    if (
      (perNetwork.rows[0]?.total ?? 0) > MAX_REGISTRATIONS_PER_NETWORK ||
      (total.rows[0]?.total ?? 0) > MAX_REGISTRATIONS_TOTAL
    ) {
      // A refused attempt leaves no rows, so refused requests do not use up a shared limit.
      await this.deps.atomic((planning) => [
        planning.auth.planDeleteAttempts({ ids: rows.map(({ id }) => id) }),
      ]);
      throw new OAuthError(
        429,
        "temporarily_unavailable",
        "Too many client registrations. Try again later.",
      );
    }
  }
}
