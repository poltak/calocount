import type { APIRequestContext, Page } from "@playwright/test";

/** The path that the test client registers as its redirect address. */
const CALLBACK_PATH = "/black-box-callback";

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** A PKCE verifier and its S256 challenge. */
async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

interface AuthorizationServer {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
}

/**
 * Connect an app as ChatGPT does: discover the server, register a client,
 * ask the owner for consent in `page`, and return the callback. The
 * owner must be signed in on `page`.
 */
export async function authorizeWithOAuth(input: {
  request: APIRequestContext;
  page: Page;
  origin: string;
  clientName: string;
  approve: () => Promise<void>;
}) {
  const { request, page, origin, clientName } = input;
  const metadata = (await (
    await request.get(`${origin}/.well-known/oauth-authorization-server`)
  ).json()) as AuthorizationServer;
  const redirectUri = `${origin}${CALLBACK_PATH}`;
  const registered = await request.post(metadata.registration_endpoint, {
    data: {
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  });
  if (!registered.ok()) {
    throw new Error(`Client registration failed: ${registered.status()}`);
  }
  const { client_id: clientId } = (await registered.json()) as {
    client_id: string;
  };

  const { verifier, challenge } = await pkcePair();
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const authorize = new URL(metadata.authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  await page.goto(authorize.toString());
  await input.approve();
  await page.waitForURL((url) => url.pathname === CALLBACK_PATH);
  const callback = new URL(page.url());
  if (callback.searchParams.get("state") !== state) {
    throw new Error("The authorization answer has another state");
  }
  return { callback, metadata, clientId, redirectUri, verifier };
}

export async function exchangeOAuthCode(input: {
  request: APIRequestContext;
  authorization: Awaited<ReturnType<typeof authorizeWithOAuth>>;
  verifier?: string;
}) {
  const { request, authorization } = input;
  return request.post(authorization.metadata.token_endpoint, {
    form: {
      grant_type: "authorization_code",
      code: authorization.callback.searchParams.get("code") ?? "",
      redirect_uri: authorization.redirectUri,
      client_id: authorization.clientId,
      code_verifier: input.verifier ?? authorization.verifier,
    },
  });
}

export async function connectWithOAuth(
  input: Parameters<typeof authorizeWithOAuth>[0],
): Promise<string> {
  const authorization = await authorizeWithOAuth(input);
  const token = await exchangeOAuthCode({
    request: input.request,
    authorization,
  });
  if (!token.ok()) {
    throw new Error(`The token request failed: ${token.status()}`);
  }
  return ((await token.json()) as { access_token: string }).access_token;
}
