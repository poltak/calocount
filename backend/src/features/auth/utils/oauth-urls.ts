// A small OAuth 2.1 authorization server for the MCP endpoint, as ChatGPT
// expects it: discovery documents (RFC 8414, RFC 9728), dynamic client
// registration (RFC 7591), the authorization code grant with PKCE S256,
// refresh tokens, and the `iss` authorization response parameter (RFC 9207).

export const AUTH_METHODS = [
  "none",
  "client_secret_post",
  "client_secret_basic",
] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

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
export function bearerChallenge({
  origin,
  invalidToken,
}: {
  origin: string;
  invalidToken: boolean;
}): string {
  const error = invalidToken
    ? `, error="invalid_token", error_description="The access token is not valid."`
    : "";
  return `Bearer resource_metadata="${oauthUrls(origin).resourceMetadata}"${error}`;
}
